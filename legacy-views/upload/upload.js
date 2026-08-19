let currentPage = 1;
let sort = ""
let firstLoad = true

function setup() {
  const uploadForm = document.getElementById('uploadForm');
  const uploadButton = document.getElementById('uploadButton');
  const fileInput = document.getElementById('fileInput');
  //const progressBar = document.getElementById('progressBar');
  //const progressDiv = document.getElementById('progressContainer');
  //const progressText = document.getElementById('progressText');
  const successBox = document.getElementById('successBox');
  const fileURL = document.getElementById('fileURL');
  const fileList = document.getElementById('fileList');
  const errorBox = document.getElementById('errorBox');
  const errorMessage = document.getElementById('errorMessage');
  const nextPage = document.getElementById('nextPage');
  const prePage = document.getElementById('previousPage');
  const pageNumber = document.getElementById('pageNumber');
  const searchForm = document.getElementById('search');
  const searchBox = document.getElementById('searchBox');
  const sortSelect = document.getElementById('sortSelect');
  const uploadContainer = document.getElementById('uploadContainer');
  
  const previews = document.getElementsByName('preview');
  var popup = document.getElementById('previewPopup');
  var close = document.getElementsByClassName("close")[0];
  var popupMessage = document.getElementById("popupMessage");

  
  var sharePopup = document.getElementById('sharePopup');
  var urlInput = document.getElementById("urlInput");
  var sharePopupClose = document.getElementById("sharePopupClose");

  
  function getTagByFileExtension(fileUrl) {
    const extensionMapping = {
      'mp3': 'audioPreview',
      'wav': 'audioPreview',
      'ogg': 'audioPreview',
      'mp4': 'videoPreview',
      'mov': 'videoPreview',
      'webm': 'videoPreview',
      'png': 'imagePreview',
      'jpg': 'imagePreview',
      'jpeg': 'imagePreview',
      'gif': 'imagePreview',
      'pdf': 'filePreview',
      'doc': 'filePreview',
      'py': 'codePreview',
      'c': 'codePreview',
      'json': 'codePreview',
      'js': 'codePreview',
      'css': 'codePreview',
      'html': 'codePreview',
      'txt': 'codePreview'
    };

    const fileExtension = fileUrl.split('.').pop();
    console.log(fileExtension)

    const tag = extensionMapping[fileExtension.toLowerCase()];

    return document.getElementById(tag)
  }
  
  function openPopup(url) {
    //loadText.style.display = "flex"
    popup.style.display = "block";
    
    const tag = getTagByFileExtension(url)
    console.log(tag)
    
    if (tag) {
      if (tag.id !== "codePreview") {
        tag.src = url
      } else {
        fetch(url)
        .then(async r => tag.innerHTML = await new Response(r.body).text());
      }
      tag.style.display = "flex"
    } else {
      popupMessage.innerHTML = "Non-supported file type, try downloading."
    }
  }
  function closePopup() {
    for (var i = 0; i < previews.length; i++) {
      previews[i].style.display = "none";
      previews[i].src = "";
    }
    popup.style.display = "none";
    document.getElementById("urlList").innerHTML = ""
  }
  
  window.onclick = function(event) {
    if (event.target == popup) {
        closePopup()
    }
  }
  close.onclick = function() {
      closePopup()
  }
  
  const firebaseConfig = {
    apiKey: "AIzaSyCILjXwpyNilznxbFTWC9J2Ys2JdJTX0vg",
    authDomain: "uygidrive.firebaseapp.com",
    projectId: "uygidrive",
    storageBucket: "uygidrive.appspot.com",
    messagingSenderId: "210147915736",
    appId: "1:210147915736:web:9e3548e815091d7512a4ad",
    measurementId: "G-GB12PYXWF7"
  };

  // Initialize Firebase
  firebase.initializeApp(firebaseConfig);
  
  function request(url, idToken, refresh) {
    const xhr = new XMLHttpRequest();

    xhr.open('POST', url, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onload = function () {
      console.log(xhr.responseText)
    }
    xhr.send(JSON.stringify({ idToken: idToken }));
  }

  uploadForm.addEventListener('submit', function (e) {
    e.preventDefault();
    
    let files = fileInput.files
    
    let doneUploadingFiles = []

    for (let i = 0; i < files.length; i++) {
      let file = files[i]
      
      const formData = new FormData();
      formData.append("file", file)
      
      const xhr = new XMLHttpRequest();

      xhr.open('POST', '/upload', true);

      //progressDiv.style.display = "block"
      uploadForm.style.display = "none"
      
      
      // Upload progress container
      let progressContainer = document.createElement("div");
      progressContainer.classList.add('progress-container');
      
      let progressName = document.createElement("span");
      progressName.innerHTML = file.name
      progressName.classList.add('file-name');
      progressContainer.appendChild(progressName)
      
      let progressTag = document.createElement("progress");
      progressTag.value = 0
      progressTag.max = 100
      progressTag.classList.add('file-progress');
      progressContainer.appendChild(progressTag)
      
      let progressSpan = document.createElement("span");
      progressSpan.innerHTML = "0%"
      progressSpan.classList.add('progress-text');
      progressContainer.appendChild(progressSpan)
      
      document.getElementById("uploadContainer").appendChild(progressContainer)
      

      xhr.upload.onprogress = function (e) {
        if (e.lengthComputable) {
          const percentComplete = Math.floor((e.loaded / e.total) * 100);
          progressTag.value = percentComplete;
          progressSpan.textContent = percentComplete + '%';
        }
      };

      xhr.onload = function () {
        if (xhr.status === 200) {
          var url = xhr.responseText;
          
          doneUploadingFiles.push(url)
          progressContainer.remove();
          
          if (doneUploadingFiles.length == files.length) {
            let progressContainers = document.getElementsByClassName("progress-container")
            
            /*for (let containerI = 0; containerI < progressContainers.length; containerI++) {
              progressContainers[containerI].remove()
            }*/
            
            successBox.style.display = 'block';
            
            let urlList = document.getElementById("urlList")
            
            for (let urlsI = 0; urlsI < doneUploadingFiles.length; urlsI++) {
              let urlLi = document.createElement("li")
              
              let urlTag = document.createElement("a")
              urlTag.style = "color: CornflowerBlue"
              urlTag.target = "_blank"
              urlTag.href = doneUploadingFiles[urlsI]
              urlTag.innerText = doneUploadingFiles[urlsI]

              urlLi.appendChild(urlTag)
              urlList.appendChild(urlLi)
              
              //urlList.appendChild(document.createElement("br"))
            }
          }
          
          /*successBox.style.display = 'block';
          fileURL.innerHTML = url;
          fileURL.href = url;

          loadList();*/
        } else {
          //progressDiv.style.display = 'none';
          progressContainer.remove();
          errorMessage.innerHTML = xhr.responseText;
          errorBox.style.display = "block";
        }
      };

      xhr.send(formData);
    };
   
  });
  
  fileInput.addEventListener('change', function () {
    const selectedFileName = document.getElementById('selectedFileName');
    
    selectedFileName.textContent = ""
    
    for (let i = 0; i < this.files.length; i++) {
      selectedFileName.innerHTML += "<li>" + this.files[i].name + ""
    }
    
    this.style.display = 'none';
    
    uploadButton.style.display = 'block';
  });
  
  function deleteFile(filename) {
    if(confirm('Are you sure to delete this file?')) {
        const xhr = new XMLHttpRequest();

        xhr.open('DELETE', '/file/' + filename, true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.onload = function () {
          console.log(xhr.responseText)
          loadList()
        }
        xhr.send();
    }
  }
  
  function shareFile(filename) {
    const xhr = new XMLHttpRequest();

    xhr.open('POST', '/getShareLink', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onload = function () {
      console.log(xhr.responseText)
      
      openSharePopup(xhr.responseText)
    }
    console.log(JSON.stringify({ file: filename }))
    xhr.send(JSON.stringify({ file: filename }));
  }
  
  function openSharePopup(url) {
    //loadText.style.display = "flex"
    sharePopup.style.display = "block";

    urlInput.value = url
  }
  
  function closeSharePopup() {
    sharePopup.style.display = "none";
    urlInput.innerHTML = ""
  }
  
  window.onclick = function(event) {
    if (event.target == sharePopup) {
        closeSharePopup()
    }
  }
  sharePopupClose.onclick = function() {
      closeSharePopup()
  }
  
   document.getElementById("copyShareLink").onclick = function() {
    urlInput.select();
    document.execCommand("copy");
    alert("Link copied to clipboard!");
  }
  
  searchForm.addEventListener('submit', function (e) {
    e.preventDefault();
    
    loadList()
  });
  
  loadList();
  
  function loadList() {
    fileList.innerHTML = 'Loading...';
    
    const search = searchBox.value
    
    const listXhr = new XMLHttpRequest();
    let url = '/list?page=' + currentPage
    
    console.log(search)
    if (search) {
      url = url + '&search=' + search
    }
    
    if (sort) {
      url = url + '&sort=' + sort
    }
    
    listXhr.open('GET', url, true);
    
    pageNumber.innerHTML = currentPage

    listXhr.onload = function () {
      if (listXhr.status === 200) {
        const {files, next} = JSON.parse(listXhr.responseText);
        
        if (next == false) {
          nextPage.style.display = "none"
        } else {
          nextPage.style.display = "inline"
        }
        
        fileList.innerHTML = '';

        files.forEach(file => {
          let url
          if (file.url) {
            url = file.url
          }
          const fileItem = document.createElement('div');
          fileItem.classList.add('file-item');
          
          const fileName = document.createElement('a');
          
          fileName.textContent = file.name
          fileName.classList.add("file-title")
          fileName.href = "javascript:void(0);"
          
          fileName.addEventListener('click', function () {
            openPopup(url)
          });
          
          fileItem.appendChild(fileName);
          
          const fileSize = document.createElement('small');
          fileSize.textContent = file.size
          fileSize.classList.add('file-size');
          
          fileItem.appendChild(fileSize);

          const downloadButton = document.createElement('button');
          downloadButton.textContent = 'Download';
          downloadButton.classList.add('copy-link-button');
          downloadButton.addEventListener('click', function () {
            document.getElementById('download_iframe').src = url; 
          });
          fileItem.appendChild(downloadButton);
          
          const deleteButton = document.createElement('button');
          deleteButton.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-trash" width="24" height="24" viewBox="0 0 24 24" stroke-width="1.5" stroke="#2c3e50" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
            <path d="M4 7l16 0" />
            <path d="M10 11l0 6" />
            <path d="M14 11l0 6" />
            <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" />
            <path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" />
          </svg>
          `
          deleteButton.classList.add('delete-button');
          deleteButton.addEventListener('click', function () {
            deleteFile(file.name);
          });
          fileItem.appendChild(deleteButton);
          
          const shareButton = document.createElement('button');
          shareButton.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-share" width="24" height="24" viewBox="0 0 24 24" stroke-width="1.5" stroke="#2c3e50" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
            <path d="M6 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" />
            <path d="M18 6m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" />
            <path d="M18 18m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" />
            <path d="M8.7 10.7l6.6 -3.4" />
            <path d="M8.7 13.3l6.6 3.4" />
          </svg>
          `
          shareButton.classList.add('share-button');
          shareButton.addEventListener('click', function () {
            shareFile(file.name)
          });
          fileItem.appendChild(shareButton);
          
          const line = document.createElement('div');
          line.classList.add('line');
          
          fileList.appendChild(fileItem);
          
          fileList.appendChild(line);
        });
        
        if (firstLoad == false) {
          document.documentElement.scrollTop = document.body.scrollTop = 420;
        }
        
        firstLoad = false
      } else {
         fileList.innerHTML = "Error: " + listXhr.responseText;
      }
    };
    
    listXhr.send()
  };
  
   sortSelect.addEventListener('change', function () {
     const selectedValue = sortSelect.value;
     
     sort = selectedValue
     currentPage = 1
     loadList()
   });
  
   nextPage.addEventListener('click', function () {
     currentPage++
     loadList()
     console.log("Loading next page")
   });
  
   prePage.addEventListener('click', function () {
     
     if (currentPage - 1 >= 1) {
       currentPage--
       loadList()
       console.log("Loading previous page")
     }
   });
  
  
}

function logout() {
  window.location.replace("/sessionLogout");
}



  
window.addEventListener('load', setup);