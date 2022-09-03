export function traverseDOMChildren(parentEle: Node, callback: (childTraverseNode: Node) => Boolean | undefined, isNested?: Boolean) {
  
    for (var i = 0; i < parentEle.childNodes.length; i++) {
      if (parentEle.childNodes[i].childNodes.length > 0) {
        if(traverseDOMChildren(parentEle.childNodes[i], callback, true))
          return true
      }
      else {
        // make sure to callback only if this is not the original called parent element
        if(isNested){
          const stopRecursion = callback(parentEle)
          if(stopRecursion){
            return true
          }
        }
      }
    }
    return null;
  }