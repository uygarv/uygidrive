function changeColorMode() {
  if (document.documentElement.getAttribute('data-bs-theme') == 'dark') {
    document.documentElement.setAttribute('data-bs-theme','light')
    document.getElementById("theme-icon").innerHTML = '<i class="fas fa-moon"></i>'; 
    
    localStorage.setItem("darkMode", "false");
  }
  else {
    document.documentElement.setAttribute('data-bs-theme','dark')
    document.getElementById("theme-icon").innerHTML = '<i class="fas fa-sun"></i>'; 
    localStorage.setItem("darkMode", "true");
  }
}

window.addEventListener("load", function(){
  const themeToggle = document.getElementById("theme-toggle");
  const themeIcon = document.getElementById("theme-icon");
  
  const isDarkMode = localStorage.getItem("darkMode") === "true";


  if (isDarkMode) {
    document.documentElement.setAttribute('data-bs-theme','dark')
    themeIcon.innerHTML = '<i class="fas fa-sun"></i>'; 
  } else {
    document.documentElement.setAttribute('data-bs-theme','light')
    themeIcon.innerHTML = '<i class="fas fa-moon"></i>'; 
  }
  

  themeToggle.addEventListener("click", () => {
    changeColorMode()
    
  });
});
