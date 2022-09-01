import { DetachableDOM } from '../../utils/DetachableDOM'

console.log("RUNTIME PROXY")

let detachEventName = '__EM__detach_' + chrome.runtime.id + "_runtimeProxy"
// detach previous content script by dispatching out this custom event
document.dispatchEvent(new CustomEvent(detachEventName))
document.addEventListener(detachEventName, () => {
  DetachableDOM.detach();
}, { once: true });

DetachableDOM.addEventListener(window, "message", async event => {
  const { type, data } = event.data

  switch(type){
    case "__EM__PROXY_SEND_RUNTIME_MESSAGE_REQUEST":
      sendRuntimeMessage(data.message, responseData => {
        event.source.postMessage({ type: "__EM__PROXY_SEND_RUNTIME_MESSAGE_RESPONSE", data: { requestId: data.requestId, responseData } }, "*")
      })
      break
    case "__EM__PROXY_GET_BLOB_FROM_BG_REQUEST":
      try{
        const { blob, fileInfo } = await getBlobFromBackgroundScript(data.url)
        event.source.postMessage({ type: "__EM__PROXY_GET_BLOB_FROM_BG_RESPONSE", data: { requestId: data.requestId, blob, fileInfo } }, "*")
      }
      catch(error){
        event.source.postMessage({ type: "__EM__PROXY_GET_BLOB_FROM_BG_RESPONSE", data: { 
          error: true, 
          errorMessage: error, 
          requestId: data.requestId 
        }}, "*")
      }
      break
    case "__EM__PROXY_GET_URL_REQUEST":
      const url = chrome.runtime.getURL(data.relativeURL)
      event.source.postMessage({ type: "__EM__PROXY_GET_URL_RESPONSE", data: { requestId: data.requestId, url } }, "*")
      break
  }

  function getBlobFromBackgroundScript(url){
    return new Promise((resolve, reject) => {

      let _fileInfo
      
      function onLoad(totalBytesRead, progress, done, buffer, chunk){
        if(done){
          const blob = new Blob(buffer)
          resolve({ blob, fileInfo: _fileInfo })
        }
      }
    
      function onError(error){
        reject(error)
      }

      function onFetchSuccess(fileInfo){
        _fileInfo = fileInfo
      }

      streamFileFromBackground(url, onLoad, onError, onFetchSuccess)
      
    })
  }
  
  function streamFileFromBackground(url, onLoadCallback, onErrorCallback, onFetchSuccess){
  
    const streamId = uniqueId()
  
    const buffer = [];
  
    function onRuntimeMessage(message){
  
      const { type, data } = message;
  
      if(data.streamId !== streamId)
        return
  
      if(type === "__EM__ON_STREAM_CHUNK"){
  
        let { chunk, length, totalBytesRead, progress, done } = data;
  
        if(chunk){
          chunk = new Uint8Array(chunk);
          buffer.push(chunk);
        }
  
        if(done){
          onLoadCallback?.(totalBytesRead, progress, true, buffer, chunk);
          chrome.runtime.onMessage.removeListener(onRuntimeMessage);
          return;
        }
  
        onLoadCallback?.(totalBytesRead, progress, false, buffer, chunk);
      }
      else if(type === "__EM__ON_STREAM_CHUNK_FETCH_SUCCESS"){
        onFetchSuccess?.(data.fileInfo)
      }
      else if(type === "__EM__ON_STREAM_CHUNK_ERROR"){
        onErrorCallback?.(data?.error);
        chrome.runtime.onMessage.removeListener(onRuntimeMessage);
      }
    }
    chrome.runtime.onMessage.addListener(onRuntimeMessage);
  
    // tell the background to fetch the file and start streaming the content to this tab
    sendRuntimeMessage({ type: "__EM__STREAM_FILE", data: { streamId, url }});
  }
  
  function uniqueId(length=16){
    return parseInt(Math.ceil(Math.random() * Date.now()).toPrecision(length).toString().replace(".", ""))
  }
  
  function sendRuntimeMessage(message, callback){
    return chrome.runtime.sendMessage(message, callback);
  }
  
})