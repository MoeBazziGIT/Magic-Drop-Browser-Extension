console.log("SERVICE WORRKER")

chrome.runtime.onInstalled.addListener(details => {
  console.log("UPDATED", details.reason)
  
  switch(details.reason){
    case "update":
      injectContentScripts(["runtimeProxy.js"])
      break;
    case "chrome_update":
      injectContentScripts(["runtimeProxy.js"])
      break;
    case "install":
      injectContentScripts(["mainApp.js", "runtimeProxy.js"])
      // TODO: open on install page
      break;
    case "shared_module_update":
      break
  }
});

chrome.downloads.onDeterminingFilename.addListener(onBrowserFileDownload)

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  // const updatedTab = await chrome.tabs.get(activeInfo.tabId)
  const { tabId } = activeInfo
  LocalStorage.set(storage => {
    const updatedActiveTabHistory = [...storage.activeTabHistory, tabId]
    // only keep the last 3 active tabs, no more
    if(updatedActiveTabHistory.length > 3)
      updatedActiveTabHistory.shift()
    return { activeTabHistory: updatedActiveTabHistory }
  })
})


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("RECEVIED", message)

    const { type, data } = message

    if(type === "__EM__STREAM_FILE"){

        const { streamId, url } = data
        
        function onLoad(totalBytesRead, progress, done, chunk, length){
          sendTabMessage(sender.tab.id, { type: "__EM__ON_STREAM_CHUNK", data: {
            streamId,
            chunk,
            totalBytesRead,
            length,
            progress,
            done
          } });
        }
  
        function onError(error){
          sendTabMessage(sender.tab.id, { type: "__EM__ON_STREAM_CHUNK_ERROR", data: { streamId, error } });
        }

        function onFetchSuccess(fileInfo){
          sendTabMessage(sender.tab.id, { type: "__EM__ON_STREAM_CHUNK_FETCH_SUCCESS", data: { streamId, fileInfo } });
        }
  
        streamFile({ url, onLoad, onError, onFetchSuccess });
    }
    if(type === "__EM__G_DRIVE_DRAG_START"){
      LocalStorage.set({
        gDriveFileDragOperation: {
          ids: data.ids,
          draggedFilesCount: data.count,
          foundDownloads: [],
        }
      })
      .then(() => sendResponse(true))
      return true
    }
    if(type === "__EM__G_DRIVE_DRAG_CANCEL"){
      LocalStorage.set((storage) => ({
        gDriveFileDragOperation: {
            ...storage.gDriveFileDragOperation,
            cancelled: true
        }
      }))
      return true
    }
    if(type === "GET_G_DRIVE_FOUND_DOWNLOADS"){
        LocalStorage.get("gDriveFileDragOperation")
            .then((gDriveFileDragOperation) => {
                // if the not all the foundDownloads have been added yet, then wait for them to be set in the storage before sending the response
                if(gDriveFileDragOperation && gDriveFileDragOperation.draggedFilesCount === gDriveFileDragOperation.foundDownloads.length){
                    sendResponse(gDriveFileDragOperation.foundDownloads)
                }
                else{
                    LocalStorage.addOnChangeListener(function waitForDownloads(storage, changes){
                        if(storage.gDriveFileDragOperation && storage.gDriveFileDragOperation.draggedFilesCount === storage.gDriveFileDragOperation.foundDownloads.length){
                            sendResponse(storage.gDriveFileDragOperation.foundDownloads)
                            LocalStorage.removeOnChangeListener(waitForDownloads)
                        }
                    })
                }
            })
        return true
    }
    if(type === "__EM__GO_TO_PREVIOUS_TAB"){
      LocalStorage.get("activeTabHistory")
        .then(activeTabHistory => {
          // check if the second to last tab in the history was recorded
          const prevTab = activeTabHistory[1]
          if(!prevTab)
            return
          
          chrome.tabs.update(prevTab, { active: true })
        })
    }
});

async function onBrowserFileDownload(downloadItem, suggestName){

    console.log("BROWSER FILE DOWNLOAD", downloadItem)

    const gDriveFileDragOperation = await LocalStorage.get("gDriveFileDragOperation")
    // Make sure to get all of the downloads for all the drive files being dragged.
    if(gDriveFileDragOperation && !gDriveFileDragOperation.cancelled && gDriveFileDragOperation.draggedFilesCount !== gDriveFileDragOperation.foundDownloads.length){
        console.log("FOUND G DRIVE DOWNLOAD", downloadItem)
        // Dont let browser download the file, cancel it and add the downloadItem to storage.gDriveFileDragOperation.foundDownloads
        chrome.downloads.cancel(downloadItem.id, async () => {
            chrome.downloads.erase({ id: downloadItem.id });
            LocalStorage.set((storage) => {
                return { gDriveFileDragOperation: { ...storage.gDriveFileDragOperation, foundDownloads: [...storage.gDriveFileDragOperation.foundDownloads, downloadItem] } }
            })
        });
    }
}

async function sendessageToAllTabs(message, exclude=[]){

    const tabs = await getTabs()
    tabs.forEach(function(tab) {

        if(exclude.find((id) => id === tab.id))
            return

        chrome.tabs.sendMessage(tab.id, message);
    });

}

async function sendTabMessage(tabId, message, options, onResponse){
  return chrome.tabs.sendMessage(tabId, message, options, onResponse);
}

async function getCurrentTab(){
    const tabs = await getTabs({ active: true, currentWindow: true });
    return tabs[0];
}
  
function getTabs(queryOptions){
    if(!queryOptions) // query all tabs
      queryOptions = {};
  
    return new Promise((resolve, reject) => {
      try{
        chrome.tabs.query(queryOptions, resolve);
      }
      catch(error){
        reject(error);
      }
    })
  }

  async function streamFile(params){

    let {
      url, onLoad, onError, onFetchSuccess, chunkMultiple
    } = params;
  
    function onStreamError(error){
      console.error(error);
      onError && onError(error);
    }
  
    try{
      let response = null;
  
      // stream file with a main url and a fallback url. Fetch first url, then if it doesnt work, fetch fallback url
      if(typeof url === 'object'){
  
        if(url.url === url.fallbackUrl) // delete duplicate
          delete url.fallbackUrl;
  
        if(!url.url){
          if(!url.fallbackUrl){
            onStreamError("At least a fallbackUrl must be provided");
            return;
          }
          url.url = url.fallbackUrl;
          url.fallbackUrl = null;
        }
  
        response = await fetch(url.url);
        if(!response.ok){
          if(url.fallbackUrl)
            response = await fetch(url.fallbackUrl);
        }
      }
      else{
        response = await fetch(url);
      }
  
      if(!response.ok){
        onStreamError(`${response.status} error while fetching ${JSON.stringify(url)} from background script`);
        return;
      }
      
      const mimeType = response.headers.get("content-type");
      onFetchSuccess && onFetchSuccess({ mimeType });
  
      // see comments in https://stackoverflow.com/a/54137265/10163060 about skewed progress due to content-length not representing body length all the time
      // const totalBytesLength = response.headers.get('Content-Encoding') !== 'gzip' ? parseInt(response.headers.get('Content-Length')) : null;
      const totalBytesLength = parseInt(response.headers.get("content-length"));
      let totalBytesRead = 0;
      let buffer = [];
  
      const reader = response.body.getReader();
      reader.read().then(function read({ done, value }){
  
        const length = value?.length;
  
        // convert the Uint8Array to a regular Array. After some minor testing, this conversion process
        //  doesnt seem to slow down the total downloading time by much (if anything)
        for(let i = 0; i < length; i++){
          buffer.push(value[i]);
        }
  
        let chunk = null;
        if(chunkMultiple){
          if(buffer.length >= chunkMultiple){
            // we can send the chunk as a multiple of chunkMultiple, other wise we must wait to fill up the buffer more
            const chunkEnd = parseInt(buffer.length / chunkMultiple) * chunkMultiple;
            chunk = buffer.slice(0, chunkEnd);
            buffer = buffer.slice(chunkEnd);
          }
        }
        else{
          // just send and reset buffer
          chunk = buffer;
          buffer = [];
        }
  
        if(chunk){
  
          totalBytesRead += chunk.length || 0;
          const progress = ((totalBytesRead / totalBytesLength)).toFixed(2);
  
          onLoad && onLoad(totalBytesRead, progress, false, chunk, length);
        }
  
        if(done){
          if(buffer){ // remaining data, must send now
            totalBytesRead += buffer.length;
            onLoad && onLoad(totalBytesRead, 1, false, buffer, buffer.length);
          }
  
          onLoad && onLoad(totalBytesRead, 1, true, [], buffer.length);
          return;
        }
  
        // Read some more, and call this function again
        return reader.read().then(read).catch(onStreamError);
      })
      .catch(onStreamError);
  
    }
    catch(error){
      onStreamError(error);
    }
  }



/* GLOBAL STATE */

const LocalStorage = {};

/* JOB QUEUE */

const jobs = [];

async function doJob(){
  if(jobs.length){
    const { jobFunction, onJobDone } = jobs[0];
    const jobDoneValue = await jobFunction();
    onJobDone(jobDoneValue);

    jobs.shift()
    doJob();
  }
}

function addJob(jobFunction){
  return new Promise((resolve, reject) => {
    try{
      jobs.push({
        jobFunction,
        onJobDone: jobDoneValue => resolve(jobDoneValue)
      });
      if(jobs.length === 1)
        doJob();
    }
    catch(error){
      reject(error);
    }
  })
}

/* ON CHANGE LISTENER */

LocalStorage.addOnChangeListener = listener => {
  chrome.storage.onChanged.addListener(async (changes, areaName) => {

    if(areaName !== "local")
      return;

    const state = await LocalStorage.get();
    listener(state, changes);

  });
}

LocalStorage.removeOnChangeListener = listener => {
  chrome.storage.onChanged.removeListener(listener);
}

/* GETTER */
function get(keys){
  if(!keys)
    keys = null; // get all of storage

  if(keys?.length === 1)
    keys = keys[0];

  return new Promise(resolve => {
    chrome.storage.local.get(keys, result => {
      if(keys === null || Object.keys(result).length > 1)
        resolve(result)
      else
        resolve(result[keys]);
    });
  });
}

LocalStorage.get = async keys => {
  return addJob(() => get(keys));
}

/* SETTER */
async function set(keys){
  if(typeof keys === 'function'){
    const state = await get();
    // keys = await Promise.resolve(keys(state)); // if the function returns a promise, this will handle that
    // keys = await keys(state);
    keys = keys(state);
    return set(keys);
  }
  else{
    return new Promise(resolve => chrome.storage.local.set(keys, resolve));
  }
}

LocalStorage.set = keys => {
  return addJob(() => set(keys));
}

getCurrentTab().then(tab => {
  const initialLocalStorage = {
    gDriveFileDragOperation: null,
  }

  LocalStorage.set(prevStorage => ({
      ...initialLocalStorage,
      activeTabHistory: prevStorage.activeTabHistory || [tab.id]
      // ...prevState,
  }))
})

async function injectContentScripts(contentScripts){

    /* inject into a tab every 3 seconds, so the browser doesnt get too overloaded at once */
    const INJECT_INTERVAL = 3000;
  
    // all tabs
    const tabs = await getTabs();
    console.log("TABS", tabs);
    let injectedTabsCount = 0;
  
    /* bring all the active tabs to the end */
    const activeTabsIds = tabs.filter(tab => {
      if(tab.active){
        return true;
      }
      return false;
    }).map(tab => tab.id);
    // all tabs (IDs)
    const tabsIds = tabs.map(tab => tab.id);
    activeTabsIds.forEach(tabId => bringTabToEnd(tabId));
  
    // move the tab that is active && that is in the current window to the end
    // TOFIX: if the user isnt in a browser window, getCurrentTab will return undefined.
    const currentTabId = (await getCurrentTab()).id;
    bringTabToEnd(currentTabId);
  
    // start injecting content scripts into tabs
    injectIntoTab();
  
    chrome.tabs.onActivated.addListener(onTabActivated);
  
    function injectIntoTab(){
  
      // inject the last tab the users browser
      const tabId = tabsIds[tabsIds.length - 1];
      console.log("injecting into tab id", tabId);
      chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        files: contentScripts,
      }, result => {
  
          console.log("RESULT", result);
  
          injectedTabsCount += 1;
  
          // remove this tab since it has just been injected
          tabsIds.splice(tabsIds.indexOf(tabId), 1);
  
          if(tabsIds.length === 0){ // no more tabs to inject
            chrome.tabs.onActivated.removeListener(onTabActivated);
            return;
          }
  
          const lastErr = chrome.runtime.lastError;
          console.log("Error", lastErr);
          if(lastErr) // tab was not injected with content script. Possible reasons are the tab has been closed, or the tab is not allowed to be injected with content scripts e.g tabs with urls of chrome://, chrome-extension:// etc.
            injectIntoTab();
          else
            setTimeout(injectIntoTab, INJECT_INTERVAL);
      });
    }
  
    function bringTabToEnd(tabId){
      // bring tab to the end of the array so it gets injected next
      tabsIds.splice(tabsIds.indexOf(tabId), 1);
      tabsIds.push(tabId);
    }
  
    function onTabActivated(activeInfo){
      // when a tab has been activated, inject it next
      const tabId = activeInfo.tabId;
      if(tabsIds.indexOf(tabId) !== -1)
        bringTabToEnd(tabId);
    }
  
}