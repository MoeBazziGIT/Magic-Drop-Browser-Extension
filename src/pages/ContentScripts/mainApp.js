import { DetachableDOM } from '../../utils/DetachableDOM'
import { traverseDOMChildren } from '../../utils'
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, admin, Timestamp } from "firebase/firestore";

console.log("MAIN APP")

const mainAppVersion = chrome.runtime.getManifest().version

const firebaseConfig = {
  apiKey: "AIzaSyCOgFH_gozX289aSRl7qvaH_-8-fr_0T4U",
  authDomain: "dropkit-9e82d.firebaseapp.com",
  projectId: "dropkit-9e82d",
  storageBucket: "dropkit-9e82d.appspot.com",
  messagingSenderId: "762820586122",
  appId: "1:762820586122:web:6dbea8ce3dc30364c89b73",
  measurementId: "G-NDQXZK3KD4"
};

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
const firestoreDB = getFirestore();
firestoreDB._settings.ignoreUndefinedProperties = true;

let detachEventName = '__EM__detach_' + chrome.runtime.id + "_mainApp"
// detach previous content script by dispatching out this custom event
document.dispatchEvent(new CustomEvent(detachEventName))
document.addEventListener(detachEventName, () => {
  DetachableDOM.detach();
}, { once: true });

/* RUNTIME PROXY */

const RuntimeProxy = {}

RuntimeProxy.sendRuntimeMessage = (message) => {
  return new Promise((resolve, reject) => {
    const requestId = uniqueId()
    window.postMessage({ type: "__EM__PROXY_SEND_RUNTIME_MESSAGE_REQUEST", data: { requestId, message } })
    DetachableDOM.addEventListener(window, "message", function onMessage(event){
      const { type, data } = event.data
  
      if(data?.requestId !== requestId)
        return
      
      if(type === "__EM__PROXY_SEND_RUNTIME_MESSAGE_RESPONSE"){
        if(!data.error)
          resolve(data.responseData)
        else
          reject(data.errorMessage)
        DetachableDOM.removeEventListener(window, "message", onMessage)
      }
    })
  })
}

RuntimeProxy.getBlobFromBackground = (url) => {
  return new Promise((resolve, reject) => {
    const requestId = uniqueId()
    window.postMessage({ type: "__EM__PROXY_GET_BLOB_FROM_BG_REQUEST", data: { requestId, url } })
    DetachableDOM.addEventListener(window, "message", function onMessage(event){
      const { type, data } = event.data
  
      if(data?.requestId !== requestId)
        return
      
      if(type === "__EM__PROXY_GET_BLOB_FROM_BG_RESPONSE"){
        if(!data.error)
          resolve({ blob: data.blob, fileInfo: data.fileInfo })
        else
          reject(data.errorMessage)
        DetachableDOM.removeEventListener(window, "message", onMessage)
      }
    })
  })
}

RuntimeProxy.getURL = (relativeURL) => {
  return new Promise((resolve, reject) => {
    const requestId = uniqueId()
    window.postMessage({ type: "__EM__PROXY_GET_URL_REQUEST", data: { requestId, relativeURL } })
    DetachableDOM.addEventListener(window, "message", function onMessage(event){
      const { type, data } = event.data
  
      if(data?.requestId !== requestId)
        return
      
      if(type === "__EM__PROXY_GET_URL_RESPONSE"){
        if(!data.error)
          resolve(data.url)
        else
          reject(data.errorMessage)
        DetachableDOM.removeEventListener(window, "message", onMessage)
      }
    })
  })
}


/* DRAG AND DROP INITIATOR */

injectMainWorldScript("webkitGetAsEntry.js")

const mutationObserver = DetachableDOM.addMutationObserver(mutationsList => {
  mutationsList.forEach(mutationRecord => {
    mutationRecord.addedNodes?.forEach(node => {
      if(inGoogleDrive()){
        // if the 'Download Anyway' popup is displayed, then click the download button in the popup so the download can start.
        //  Google Drive displays this when the use tries to download large files, it warns the user that the file is
        //  too large to detect viruses.
        const potentialDownloadAnywayBtn = node.childNodes && node.childNodes[2]?.childNodes[1]
        if(potentialDownloadAnywayBtn?.innerText.toLowerCase() === "download anyway"){
          let clickEvent = new MouseEvent('click', { bubbles: true })
          potentialDownloadAnywayBtn.dispatchEvent(clickEvent)
        }
      }
    })
  })
})
mutationObserver.observe(document, { childList: true, subtree: true });

// This flag indicates wether or not the dragged file started from within this page
let isDragSource = false

DetachableDOM.addEventListener(window, "dragstart", async (event) => {

  // console.log("DRAG SOURCE START", event)

  // Google Drive drag and drop
  if(inGoogleDrive()){
    // if the user isnt holding down the shift key, then perform emulated drag n drop for the selected google drive files
    if(!event.shiftKey){

      // console.log("G DRIVE DRAG START")

      const selectedDriveFileElements = getSelectedDriveFileElements()
      const selectedDriveFilesCount = selectedDriveFileElements.length
      const selectedDriveFileIds = selectedDriveFileElements.map((selectedElement) => selectedElement.parentElement.dataset.id)
      const data = { ids: selectedDriveFileIds, count: selectedDriveFilesCount }

      // startDrag("g-drive", data)

      // TEMP
      isDragSource = true
      // event.stopImmediatePropagation()
      // event.stopPropagation()
      event.dataTransfer.setDragImage(dragImg, 0, 0)
      event.dataTransfer.setData("text/plain", "PLACEHOLDER");
      event.dataTransfer.setData("__em__/dnd-files", JSON.stringify({ type, data }));
      return

      const message = "To drag files within google drive folders, press the shift key before dragging"
      displayMessageScreen(message)

      await RuntimeProxy.sendRuntimeMessage({ type: "__EM__G_DRIVE_DRAG_START", data })
      
      selectedDriveFileElements.forEach((element, index) => {

        let clickEvent = new MouseEvent('click', { bubbles: true })
        element.dispatchEvent(clickEvent)

        DetachableDOM.setTimeout(() => {
          const contextMenuEvent = new MouseEvent('contextmenu', { bubbles: true })
          element.dispatchEvent(contextMenuEvent)

          // const downloadButton = [...document.querySelectorAll("[data-tooltip=Download]")].find((element) => element.innerText === "Download")
          const downloadButton = [...document.querySelectorAll("[data-tooltip=Download]")][2]
          // click the download button (doesnt work with click event, must use mousedown and mouseup)
          let mouseDownEvent = new MouseEvent('mousedown', { bubbles: true })
          downloadButton.dispatchEvent(mouseDownEvent)
          let mouseUpEvent = new MouseEvent('mouseup', { bubbles: true })
          downloadButton.dispatchEvent(mouseUpEvent)
        }, 0)
      })
      
      return
    }
  }

  // Web page images drag and drop
  // Grab the element at this x and y position
  const elements = document.elementsFromPoint(event.clientX, event.clientY)
  const potentialImage = elements.find((elem) => elem.nodeName.toLowerCase() === 'img')
  if(potentialImage?.src){

    if(event.target !== potentialImage && event.target.getAttribute("draggable"))
      return
    
    // console.log("WEB PAGE IMAGE DRAG START", potentialImage)

    let originalSrc = potentialImage.src
    let largestSrc

    // if the image has a srcset atribute, then try to find and use the highest quality image
    if(potentialImage.srcset){
      try{
        const parsedSrcset = parseSrcset(potentialImage.srcset, { strict: true })
        let largestWidth = largestHeight = largestDensity = { value: 0 }
        parsedSrcset.forEach(({ url, width, height, density }) => {
          if(width && width > largestWidth.value){
            largestWidth = { value: width, url }
          }
          if(height && height > largestHeight.value){
            largestHeight = { value: height, url }
          }
          if(density && density > highetDensity.value){
            largestDensity = { value: density, url }
          }
        })
  
        if(largestWidth){
          largestSrc = largestWidth.url
        }
        else if(largestHeight){
          largestSrc = largestHeight.url
        }
        else if(largestDensity){
          largestSrc = largestDensity.url
        }
      }
      catch(error){
        // srcset string was invalid, just continue without trying to parse and find the largest image src
      }
    }
    
    startDrag("web-page-image", { originalSrc, largestSrc })
    return
  }

  function startDrag(type, data){
    isDragSource = true

    event.stopImmediatePropagation()
    event.stopPropagation()

    event.dataTransfer.setDragImage(dragImg, 0, 0)
    
    // Set as text/plain just so that the browser can allow this drag to go to other contexts (ie. other tabs, windows, browsers etc .), otherwise, 
    //  it wouldnt work. Must set either text/plain or text/uri-list.
    //  See https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API/Recommended_drag_types#dragging_custom_data
    event.dataTransfer.setData("text/plain", "PLACEHOLDER");
    event.dataTransfer.setData("__em__/dnd-files", JSON.stringify({ type, data }));

    addDoc(collection(firestoreDB, `magic-drop-${process.env.NODE_ENV}--drag-start`), {
      dragType: type,
      dragData: data,
      location: { origin: window.location.origin, href: window.location.href, hostname: window.location.hostname },
      dateTime: getDates(),
      mainAppVersion
    })
  }
  
}, true)

DetachableDOM.addEventListener(window, "dragend", (event) => {

  // console.log("DRAG SOURCE END")

  if(isDragSource && inGoogleDrive()){
    hideMessageScreen()
  }

  isDragSource = false
  
}, true)

/* GESTURE RECOGNITION TO GO TO PREVIOUS TAB */

let xDirection = null;
 
let oldX = null;

let directionChangeTimeoutId = null
let directionChangeCount = 0

DetachableDOM.addEventListener(window, "dragover", event => {

  if(!isDragSource)
    return
  
  if(!oldX){
    oldX = event.pageX;
    return
  }
  
  let newXDirection = xDirection;

  if (oldX < event.pageX) {
      newXDirection = "right";
  } else if(oldX > event.pageX) {
      newXDirection = "left";
  }

  if(!xDirection){
    xDirection = newXDirection
    return
  }

  if(newXDirection !== xDirection){
    DetachableDOM.clearTimeout(directionChangeTimeoutId)
    directionChangeTimeoutId = DetachableDOM.setTimeout(() => {
      directionChangeCount = 0
    }, 200)
    directionChangeCount += 1
  }

  if(directionChangeCount === 4){
    directionChangeCount = 0
    onShakeGesture()
  }

  oldX = event.pageX;
  xDirection = newXDirection
  
}, true)

function onShakeGesture(){
  RuntimeProxy.sendRuntimeMessage({ type: "__EM__GO_TO_PREVIOUS_TAB" })
  addDoc(collection(firestoreDB, `magic-drop-${process.env.NODE_ENV}--drag-shake-gesture`), {
    isGoogleDrive: inGoogleDrive(),
    location: { origin: window.location.origin, href: window.location.href, hostname: window.location.hostname },
    dateTime: getDates(),
    mainAppVersion
  })
}


/* DRAG AND DROP EMULATOR */

const placeHolderFile = new File(["placeholder"], "placeholder.png", { type: 'image/png' });
const dataTransfer = new DataTransfer();
dataTransfer.items.add(placeHolderFile);

const dragImg = new Image()
dragImg.src = chrome.runtime.getURL('/assets/file.svg')

DetachableDOM.addEventListener(window, "dragenter", (event) => {

  if(isDragSource || isEmulatedEvent(event) || !event.dataTransfer.types.includes("__em__/dnd-files"))
    return

  // console.log("DRAG ENTER", event.target)

  event.stopImmediatePropagation()
  event.stopPropagation()
  event.preventDefault()

  const emulatedDragenterEvent = setAsEmulatedEvent(new DragEvent("dragenter", { ...getEventProps(event), dataTransfer, bubbles: true }));
  event.target.dispatchEvent(emulatedDragenterEvent);
}, true)

DetachableDOM.addEventListener(window, "dragleave", (event) => {

  if(isDragSource || isEmulatedEvent(event) || !event.dataTransfer.types.includes("__em__/dnd-files"))
    return

  // console.log("DRAG LEAVE", event.target)

  event.stopImmediatePropagation()
  event.stopPropagation()
  event.preventDefault()

  const emulatedDragleaveEvent = setAsEmulatedEvent(new DragEvent("dragleave", { ...getEventProps(event), dataTransfer, bubbles: true }));
  event.target.dispatchEvent(emulatedDragleaveEvent);
}, true)

DetachableDOM.addEventListener(window, "dragover", (event) => {

  if(isDragSource || isEmulatedEvent(event) || !event.dataTransfer.types.includes("__em__/dnd-files"))
    return

  // console.log("DRAG OVER", event.target)

  event.stopImmediatePropagation()
  event.stopPropagation()
  event.preventDefault()

  const emulatedDragoverEvent = setAsEmulatedEvent(new DragEvent("dragover", { ...getEventProps(event), dataTransfer, bubbles: true }));
  event.target.dispatchEvent(emulatedDragoverEvent);
}, true)

DetachableDOM.addEventListener(window, "dragend", (event) => {

  if(isDragSource || isEmulatedEvent(event) || !event.dataTransfer.types.includes("__em__/dnd-files"))
    return

  // console.log("DRAG END", event.target)

  event.stopImmediatePropagation()
  event.stopPropagation()
  event.preventDefault()

  const emulatedDragendEvent = setAsEmulatedEvent(new DragEvent("dragend", { ...getEventProps(event), dataTransfer, bubbles: true }));
  event.target.dispatchEvent(emulatedDragendEvent);
}, true)

DetachableDOM.addEventListener(window, "drop", async (event) => {

  if(isDragSource || isEmulatedEvent(event) || !event.dataTransfer.types.includes("__em__/dnd-files"))
    return
  
  // display the loading screen
  displayMessageScreen("Loading...", true)
  
  const dndFiles = getDraggedFilesData(event)
  
  event.stopImmediatePropagation()
  event.stopPropagation()
  event.preventDefault()

  /* need to keep emulating a fake drag over event until the emulated drop event happens */
  const emulatedDragoverEvent = setAsEmulatedEvent(new DragEvent("dragover", { ...getEventProps(event), dataTransfer, bubbles: true }));
  // dispatch the same dragover event every "few hundred milliseconds" (according to https://developer.mozilla.org/en-US/docs/Web/API/Document/dragover_events)
  //  Use 100 ms intervals, seems to work fine
  event.target.dispatchEvent(emulatedDragoverEvent)
  const dropTargetDragoverIntervalId = DetachableDOM.setInterval(() => {
    event.target.dispatchEvent(emulatedDragoverEvent)
  }, 100)
  
  if(dndFiles.type === "g-drive"){
    const gDriveDownloads = await RuntimeProxy.sendRuntimeMessage({ type: "GET_G_DRIVE_FOUND_DOWNLOADS" })
    const files = await Promise.all(gDriveDownloads.map((downloadItem) => {
      return new Promise(async (resolve, reject) => {
        const { finalUrl, filename, mime } = downloadItem
        const { blob } = await RuntimeProxy.getBlobFromBackground(finalUrl)
        const file = new File([blob], filename, { type: mime })
        resolve(file)
      })
    }))
    
    emulateFilesDrop(files)
    return
  }
  else if(dndFiles.type === "web-page-image"){
    
    const { originalSrc, largestSrc } = dndFiles.data

    let blob, fileInfo
    
    if(largestSrc){
      // try to fetch the largest src, if not then fallback to the originalSrc
      try{
        const data = await RuntimeProxy.getBlobFromBackground(largestSrc)
        blob = data.blob; fileInfo = data.fileInfo
      }
      catch(error){
        const data = await RuntimeProxy.getBlobFromBackground(originalSrc)
        blob = data.blob; fileInfo = data.fileInfo
      }
    }
    else{
      const data = await RuntimeProxy.getBlobFromBackground(originalSrc)
      blob = data.blob; fileInfo = data.fileInfo
    }

    let fileName = fileInfo.name || "Image"
    // use image/png as the default because it is the most common type
    let mimeType = fileInfo.mimeType || "image/png"
    
    if(!fileInfo.name && fileInfo.mimeType){
      if(fileInfo.mimeType === "image/png")
        fileName = "Image.png"
      else if(fileInfo.mimeType === "image/jpeg" || fileInfo.mimeType === "image/jpg")
        fileName = "Image.jpeg"
      else if(fileInfo.mimeType === "image/gif")
        fileName = "Gif.gif"
      else if(fileInfo.mimeType === "image/svg+xml")
        fileName = "Image.svg"
      else if(fileInfo.mimeType === "image/apng")
        fileName = "Image.apng"
      else if(fileInfo.mimeType === "image/avif")
        fileName = "Image.avif"
      else if(fileInfo.mimeType === "image/webp")
        fileName = "Image.webp"
    }

    if(!fileInfo.mimeType && fileInfo.name){
      // try to get the mime type from the file name extension
      const extension = getFileExtension(fileInfo.name)
      
      if(extension === "png")
        mimeType = "image/png"
      else if(extension === "jpeg")
        mimeType = "image/jpeg"
      else if(extension === "gif")
        mimeType = "image/gif"
      else if(extension === "svg")
        mimeType = "image/svg+xml"
      else if(extension === "apng")
        mimeType = "image/apng"
      else if(extension === "avif")
        mimeType === "image/avif"
      else if(extension === "webp")
        mimeType = "image/webp"
    }
    
    const file = new File([blob], fileName, { type: mimeType })
  
    emulateFilesDrop([file])
  }

  function emulateFilesDrop(files){

    // console.log("READY TO DROP", files)

    // stop the emulated dragover events from firing off
    DetachableDOM.clearInterval(dropTargetDragoverIntervalId)

    // if files are dropped on an input element, then dispatch the onchange event for it
    if(event.target.nodeName.toLowerCase() === "input" && event.target.type === "file"){
      dispatchInputElemEmulatedChangeEvent(event.target, toFileList(files));
    }
    // if not, then dispatch a drop event on it
    else{
      dataTransfer.items.clear()
      files.forEach((file) => {
        dataTransfer.items.add(file)
      })
      
      const emulatedDropEvent = setAsEmulatedEvent(new DragEvent("drop", { ...getEventProps(event), dataTransfer, bubbles: true }))
      event.target.dispatchEvent(emulatedDropEvent)
    }

    hideMessageScreen()

    addDoc(collection(firestoreDB, `magic-drop-${process.env.NODE_ENV}--drag-drop`), {
      dragType: dndFiles.type,
      dragData: dndFiles.data,
      location: { origin: window.location.origin, href: window.location.href, hostname: window.location.hostname },
      dateTime: getDates(),
      mainAppVersion
    })
    
  }

  function onError(error){
    // TODO
    setLoadingScreenError(error)
    // HERE
  }
  
}, true)

/* Emulated events */
function isEmulatedEvent(event){
  return !!event.__emulated__event;
}

function setAsEmulatedEvent(event){
  event.__emulated__event = true;
  return event;
}

function getEventProps(eventToCopy){
  // copies props from a real event to another. Used for creating emulated drag events with real properties such as
  //  clientX and clientY, instead of having them be empty.
  return {
    // MouseEvent props (https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent)
    altKey: eventToCopy.altKey,
    button: eventToCopy.button,
    buttons: eventToCopy.buttons,
    clientX: eventToCopy.clientX,
    clientY: eventToCopy.clientY,
    ctrlKey: eventToCopy.ctrlKey,
    metaKey: eventToCopy.metaKey,
    movementX: eventToCopy.movementX,
    movementY: eventToCopy.movementY,
    offsetX: eventToCopy.offsetX,
    offsetY: eventToCopy.offsetY,
    pageX: eventToCopy.pageX,
    pageY: eventToCopy.pageY,
    region: eventToCopy.region,
    relatedTarget: eventToCopy.relatedTarget,
    screenX: eventToCopy.screenX,
    screenY: eventToCopy.screenY,
    shiftKey: eventToCopy.shiftKey,
    mozPressure : eventToCopy.mozPressure ,
    mozInputSource : eventToCopy.mozInputSource ,
    webkitForce : eventToCopy.webkitForce,
    x: eventToCopy.x,
    y: eventToCopy.y,
    // UIEvent props
    detail: eventToCopy.detail,
    view: eventToCopy.view,
    sourceCapabilities: eventToCopy.sourceCapabilities,
    // Event props
    bubbles: eventToCopy.bubbles,
    cancelable: eventToCopy.cancelable,
    composed: eventToCopy.composed,
  };
}

function sendMessage(targetWindow, message, transferables){
  return targetWindow.postMessage(message, "*", transferables);
}


function getSelectedDriveFileElements(){
  return [...document.querySelectorAll("[draggable] > [aria-selected=true]")]
}

// temporary until able to import uuid package
function uniqueId(length=16){
  return parseInt(Math.ceil(Math.random() * Date.now()).toPrecision(length).toString().replace(".", ""))
}

function getDraggedFilesData(event){
  const dndFilesData = event.dataTransfer.getData("__em__/dnd-files")
  return dndFilesData ? JSON.parse(dndFilesData) : null
}

async function displayMessageScreen(message, isFocused){

  let container = document.getElementById("dnd-loading-screen-container")
  if(container){
    container.style.opacity = "1"
    container.style.background = isFocused ? "rgb(0 0 0 / 50%)" : "transparent"
    container.style.backdropFilter = isFocused ? "blur(10px)" : "none"
    container.setAttribute("data-timedisplayed", getEpoch())
    return
  }
  
  container = document.createElement("div")
  container.setAttribute("id", "dnd-loading-screen-container")
  container.setAttribute("data-displayed", 0)
  container.style = `
    all: auto;
    position: fixed !important;
    width: 100% !important;
    height: 100% !important;
    top: 0 !important;
    left: 0 !important;
    z-index: 2147483647 !important;
    visibility: visible !important;
    display: flex !important;
    justify-content: center !important;
    padding: 20px !important;
    transition: opacity 250ms !important;
    box-sizing: border-box !important;
    pointer-events: none !important;
    background: ${isFocused ? "rgb(0 0 0 / 50%)" : "transparent"};
    backdrop-filter: ${isFocused ? "blur(10px)" : "none"};
    opacity: 1;
  }
  `

  const modalContainer = document.createElement("div")
  modalContainer.setAttribute("id", "dnd-loading-screen-modal-container")
  modalContainer.style = `
    all: auto;
    display: flex !important;
    justify-content: center !important;
    align-items: center !important;
    background-color: white !important;
    border-radius: 15px !important;
    align-self: end !important;
    margin-bottom: 30px !important;
    box-shadow: 0 0 18px -6px rgb(0 0 0 / 50%) !important;
    border: 1px solid rgb(0 0 0 / 10%) !important;
  `

  const loadingIndicatorContainer = document.createElement("div")
  loadingIndicatorContainer.setAttribute("id", "dnd-loading-screen-loading-indicator-container")
  loadingIndicatorContainer.style = `
    all: auto;
    display: flex !important;
    justify-content: center !important;
    align-items: center !important;
    gap: 1rem !important;
    padding: 1rem 1.5rem !important;
  `

  const loadingIndicatorHeaderText = document.createElement("h3")
  loadingIndicatorHeaderText.innerText = message
  loadingIndicatorHeaderText.style = `
    all: auto;
    font-size: 1rem !important;
    color: rgb(0 0 0 / 30%) !important;
    font-family: monospace !important;
    margin: 0 !important;
  `

  const loadingIndicatorHeaderIcon = document.createElement("img")
  loadingIndicatorHeaderIcon.src = await RuntimeProxy.getURL('/assets/file.svg')
  loadingIndicatorHeaderIcon.alt = "file with image and text inside it"
  loadingIndicatorHeaderIcon.style = `
    all: auto;
    width: 3rem;
    height: 3rem;
  `

  loadingIndicatorContainer.appendChild(loadingIndicatorHeaderIcon)
  loadingIndicatorContainer.appendChild(loadingIndicatorHeaderText)
  modalContainer.appendChild(loadingIndicatorContainer)
  container.appendChild(modalContainer)
  DetachableDOM.appendChild(document.body, container)

  container.setAttribute("data-timedisplayed", getEpoch())
  container.style.opacity = "1"
}

function hideMessageScreen(){
  const container = document.getElementById("dnd-loading-screen-container")
  if(container){

    const MIN_SCREEN_TIME = 350

    // let the loading screen be displayed for at least MIN_SCREEN_TIME 
    const epochNow = getEpoch()
    const epochDisplayed = parseInt(container.dataset.timedisplayed)
    const delta = epochNow - epochDisplayed;
    const hideIn = MIN_SCREEN_TIME - delta
    
    if(hideIn > 0){
      DetachableDOM.setTimeout(hide, hideIn)
    }
    else{
      hide()
    }

    function hide(){
      container.style.opacity = "0"
    }
    
  }
}

function getEpoch(){
  return Math.round(Date.now())
}

function getFileExtension(fileName) {
  return fileName.slice((fileName.lastIndexOf(".") - 1 >>> 0) + 2);
}

/* 
  IMAGE SRCSET PARSER 
  from: https://github.com/sindresorhus/srcset
*/

/**
This regex represents a loose rule of an “image candidate string”.
@see https://html.spec.whatwg.org/multipage/images.html#srcset-attribute
An “image candidate string” roughly consists of the following:
1. Zero or more whitespace characters.
2. A non-empty URL that does not start or end with `,`.
3. Zero or more whitespace characters.
4. An optional “descriptor” that starts with a whitespace character.
5. Zero or more whitespace characters.
6. Each image candidate string is separated by a `,`.
We intentionally implement a loose rule here so that we can perform more aggressive error handling and reporting in the below code.
*/
const imageCandidateRegex = /\s*([^,]\S*[^,](?:\s+[^,]+)?)\s*(?:,|$)/;

function duplicateDescriptorCheck(allDescriptors, value, postfix){
	allDescriptors[postfix] = allDescriptors[postfix] || {};
	if (allDescriptors[postfix][value]) {
		throw new Error(`No more than one image candidate is allowed for a given descriptor: ${value}${postfix}`);
	}

	allDescriptors[postfix][value] = true;
};

function fallbackDescriptorDuplicateCheck(allDescriptors){
	if (allDescriptors.fallback) {
		throw new Error('Only one fallback image candidate is allowed');
	}

	if (allDescriptors.x['1']) {
		throw new Error('A fallback image is equivalent to a 1x descriptor, providing both is invalid.');
	}

	allDescriptors.fallback = true;
};

function descriptorCountCheck(allDescriptors, currentDescriptors){
	if (currentDescriptors.length === 0) {
		fallbackDescriptorDuplicateCheck(allDescriptors);
	} else if (currentDescriptors.length > 1) {
		throw new Error(`Image candidate may have no more than one descriptor, found ${currentDescriptors.length}: ${currentDescriptors.join(' ')}`);
	}
};

function validDescriptorCheck(value, postfix, descriptor){
	if (Number.isNaN(value)) {
		throw new TypeError(`${descriptor || value} is not a valid number`);
	}

	switch (postfix) {
		case 'w': {
			if (value <= 0) {
				throw new Error('Width descriptor must be greater than zero');
			} else if (!Number.isInteger(value)) {
				throw new TypeError('Width descriptor must be an integer');
			}

			break;
		}

		case 'x': {
			if (value <= 0) {
				throw new Error('Pixel density descriptor must be greater than zero');
			}

			break;
		}

		case 'h': {
			throw new Error('Height descriptor is no longer allowed');
		}

		default: {
			throw new Error(`Invalid srcset descriptor: ${descriptor}`);
		}
	}
};

function parseSrcset(string, {strict = false} = {}) {
	const allDescriptors = strict ? {} : undefined;

	return string.split(imageCandidateRegex)
		.filter((part, index) => index % 2 === 1)
		.map(part => {
			const [url, ...descriptors] = part.trim().split(/\s+/);

			const result = {url};

			if (strict) {
				descriptorCountCheck(allDescriptors, descriptors);
			}

			for (const descriptor of descriptors) {
				const postfix = descriptor[descriptor.length - 1];
				const value = Number.parseFloat(descriptor.slice(0, -1));

				if (strict) {
					validDescriptorCheck(value, postfix, descriptor);
					duplicateDescriptorCheck(allDescriptors, value, postfix);
				}

				switch (postfix) {
					case 'w': {
						result.width = value;
						break;
					}

					case 'h': {
						result.height = value;
						break;
					}

					case 'x': {
						result.density = value;
						break;
					}

					// No default
				}
			}

			return result;
		});
}

function injectMainWorldScript(scriptName){
  const script = document.createElement("script")
  script.src = chrome.runtime.getURL(scriptName)
  script.onload = function() {
    this.remove()
  }
  DetachableDOM.appendChild(document.documentElement, script);
}

function inGoogleDrive(){
  return window.location.origin === "https://drive.google.com"
}

function dispatchInputElemEmulatedChangeEvent(inputElem, fileList){
  inputElem.value = ""
  inputElem.files = fileList
  // Create a new 'change' event and dispatch it
  const changeEvent = setAsEmulatedEvent(new Event('change', { bubbles: true }))
  inputElem.dispatchEvent(changeEvent)
}

function toFileList(files){

  // accept array of Files or a single File object
  if(!Array.isArray(files))
    files = [files]

  const fileListContainer = new ClipboardEvent("").clipboardData || new DataTransfer()

  files.forEach(file => {
    fileListContainer.items.add(file);
  });

  const fileList = fileListContainer.files;
  return fileList;
}

export function getDates(){

  const dateNow = new Date()
  
  return {
    epoch: dateNow.getTime(),
    local: dateNow.toString(),
    utc: dateNow.toUTCString(),
    yearUTC: dateNow.getUTCFullYear(),
    monthUTC: dateNow.getUTCMonth(),
    dayUTC: dateNow.getUTCDate(),
    toronto: new Date().toLocaleString('en-US', { timeZone: 'America/Toronto' })
  };
}

function getSelectedDriveFileElementName(selectedDriveFileElem){
  traverseDOMChildren(selectedDriveFileElem, child => {
    if(child.dataset.tooltip){
      let name = child.innerText
      if(!name){
        const now = new Date()
        name = "file " + now.toLocaleString()
      }
      data.filesInfo[index] = { id: selectedDriveFileIds[index], name }
      return true
    }
  })
}