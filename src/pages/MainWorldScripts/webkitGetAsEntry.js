/* override the webkitGetAsEntry prop method of the DataTransferItem object. Lots of sites (e.g youtube, dropbox, figma)
  use this method to retrieve the file or info about the dragged and dropped file. However, if a file in a DataTransfer
  is a dropkit drag and drop file, then this method will return null (browser sets this behavior). So override this method,
  to see if the file is a dropkit file, and if so, return some props (ie. isFile, file, getMetaData & name). The original
  method returns other props as well, however we cannot construct them (e.g. filesystem which is a FileSystem object
  which we cannot construct or create since the dropkit file is not actually coming from the users filesystem) but it
  so far all the sites I have tested that use this method do not use these unaccessible props. If I start to notice that
  these props are being accessed by some sites, then will have to find a way to implement them.
  More info at: https://developer.mozilla.org/en-US/docs/Web/API/DataTransferItem/webkitGetAsEntry
*/

DataTransferItem.prototype.webkitGetAsEntry = function(originalWebkitGetAsEntry){
    return function(){
      // if the orignal method doesnt return null, then it isnt a MagicDrop file in this datatransfer
      //  so return it
      const originalResult = originalWebkitGetAsEntry.call(this);
      if(originalResult)
       return originalResult;

      const thisFile = this.getAsFile();
      if(!thisFile)
       return null;

      const { name, lastModifiedDate, lastModified, size } = thisFile;
      const modificationTime = lastModifiedDate || (lastModified || (lastModified === 0) && new Date(lastModified)) || new Date;
      return {
        isFile: true,
        file: onSuccess => onSuccess(thisFile),
        getMetaData: onSuccess => onSuccess({ modificationTime, size }),
        name,
        isDirectory: false,
        fullPath: "",
      }
    };
  }(DataTransferItem.prototype.webkitGetAsEntry);