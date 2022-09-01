console.log("DETACHABLE DOM")

type DetachJob = {
  jobType: string, data: any
}

type ChromeRuntimeEventNamespace = (
  typeof chrome.runtime.onConnect | 
  typeof chrome.runtime.onConnectExternal | 
  typeof chrome.runtime.onInstalled | 
  typeof chrome.runtime.onMessage |
  typeof chrome.runtime.onMessageExternal |
  typeof chrome.runtime.onRestartRequired |
  typeof chrome.runtime.onStartup |
  typeof chrome.runtime.onSuspend |
  typeof chrome.runtime.onSuspendCanceled |
  typeof chrome.runtime.onUpdateAvailable
)

// a list of detach jobs ie. unbinding event listeners, clear timers, remove DOM nodes etc.
let detachJobs: DetachJob[] = []

let DetachableDOM = {
  /* ADD EVENT LISTENERS */
  addEventListener(target: HTMLElement, type: string, listener: EventListenerOrEventListenerObject, options: EventListenerOptions) {
    detachJobs.push({
      jobType: "removeEventListener",
      data: {
        target,
        type,
        listener,
        options
      }
    });
  
    return target.addEventListener(type, listener, options);
  },
  removeEventListener(target: HTMLElement, type: string, listener: EventListenerOrEventListenerObject, options: EventListenerOptions){
    let returnValue = undefined;
    // remove the job from jobs array and remove event listener
    detachJobs = detachJobs.filter(job => {
      if(job.jobType === "removeEventListener" && job.data.target === target && job.data.type === type && job.data.listener === listener && job.data.options === options){
        returnValue = target.removeEventListener(type, listener, options);
        return false;
      }
      return true;
    });
  
    return returnValue;
  },
  /* ADD NODE TO DOM */
  appendChild(target: HTMLElement, childNode: Node){
    detachJobs.push({
      jobType: "removeNode",
      data: {
        node: childNode
      }
    });
  
    return target.appendChild(childNode);
  },
  insertBefore(parentNode: HTMLElement, newNode: Node, referenceNode: Node){
    detachJobs.push({
      jobType: "removeNode",
      data: {
        node: newNode
      }
    });
  
    return parentNode.insertBefore(newNode, referenceNode);
  },
  prepend(target: HTMLElement, newNode: Node){
    detachJobs.push({
      jobType: "removeNode",
      data: {
        node: newNode
      }
    });
  
    return target.prepend(newNode);
  },
  remove(nodeToRemove: HTMLElement){
    let returnValue = undefined;
    // remove the job from jobs array and remove the node from DOM
    detachJobs = detachJobs.filter(job => {
      if(job.jobType === "removeNode" && job.data.node === nodeToRemove){
        returnValue = nodeToRemove.remove();
        return false;
      }
      return true;
    });
  
    return returnValue;
  },
  /* SETTING WINDOW TIMERS */
  setInterval(callback: (args: void) => void, ms?: number): NodeJS.Timer{
    const id = setInterval(callback, ms);
    detachJobs.push({
      jobType: "clearInterval",
      data: { id }
    });
    return id;
  },
  clearInterval(id: NodeJS.Timer){
    let returnValue = undefined;
    // remove the job from jobs array and clear the interval
    detachJobs = detachJobs.filter(job => {
      if(job.jobType === "clearInterval" && job.data.id === id){
        returnValue = clearInterval(id);
        return false;
      }
      return true;
    });
  
    return returnValue;
  },
  setTimeout(callback: (args: void) => void, ms?: number){
    const id = setTimeout(callback, ms);
    detachJobs.push({
      jobType: "clearTimeout",
      data: { id }
    });
    return id;
  },
  clearTimeout(id: NodeJS.Timer){
    let returnValue = undefined;
    // remove the job from jobs array and clear the timeout
    detachJobs = detachJobs.filter(job => {
      if(job.jobType === "clearTimeout" && job.data.id === id){
        returnValue = clearTimeout(id);
        return false;
      }
      return true;
    });
  
    return returnValue;
  },
  /* ADDING MUTATION OBSERVER */
  addMutationObserver(callback: MutationCallback){
    const mutationObserver = new MutationObserver(callback);
    detachJobs.push({
      jobType: "disconnectMutationObserver",
      data: {
        mutationObserver
      }
    });
    return mutationObserver;
  },
  disconnectMutationObserver(mutationObserver: MutationObserver){
    let returnValue = undefined;
    // remove the job from jobs array and disconnect the mutationObserver
    detachJobs = detachJobs.filter(job => {
      if(job.jobType === "disconnectMutationObserver" && job.data.mutationObserver === mutationObserver){
        returnValue = mutationObserver.disconnect();
        return false;
      }
      return true;
    });
  
    return returnValue;
  },
  /* ADDING LISTENERS TO CHROME.RUNTIME.{EVENT_NAMESPACE} */
  addRuntimeEventListener(runtimeEventNamespace: ChromeRuntimeEventNamespace, listener: typeof runtimeEventNamespace.addListener){
    detachJobs.push({
      jobType: "removeRuntimeEventListener",
      data: {
        runtimeEventNamespace,
        listener,
      }
    });
    
    // @ts-ignore TODO: Couldnt figure this one out..
    runtimeEventNamespace.addListener(listener)
  },
  removeRuntimeEventListener(runtimeEventNamespace: ChromeRuntimeEventNamespace, listener: typeof runtimeEventNamespace.removeListener){
    let returnValue = undefined;
    detachJobs = detachJobs.filter(job => {
      if(job.jobType === "removeRuntimeEventListener" && job.data.runtimeEventNamespace === runtimeEventNamespace && job.data.listener === listener){
        // @ts-ignore TODO: Couldnt figure this one out..
        returnValue = runtimeEventNamespace.removeListener(listener);
        return false;
      }
      return true;
    });
  
    return returnValue;
  },
  /* method to detach all */
  detach(){
    // perform detach jobs ie. tear down content script
    detachJobs.forEach(job => {
      const { jobType, data } = job;
      const { target, type, listener, options, node, id, mutationObserver, runtimeEventNamespace } = data;
      switch(jobType){
        case "removeEventListener":
          target.removeEventListener(type, listener, options);
          break;
        case "removeNode":
          node.remove();
          break;
        case "clearInterval":
          clearInterval(id);
          break;
        case "clearTimeout":
          clearTimeout(id);
          break;
        case "disconnectMutationObserver":
          mutationObserver.disconnect();
          break;
        case "removeRuntimeEventListener":
          runtimeEventNamespace.removeListener(listener)
          break
      }
    })

    // @ts-ignore
    DetachableDOM = null
    // @ts-ignore
    detachJobs = null
  }
}

export { DetachableDOM }