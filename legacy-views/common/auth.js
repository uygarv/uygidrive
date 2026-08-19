window.onload = function() {
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
  
  firebase.auth().setPersistence(firebase.auth.Auth.Persistence.NONE);
  
  function request(url, idToken) {
    const xhr = new XMLHttpRequest();

    xhr.open('POST', '', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onload = function () {
      console.log(xhr.responseText)
    }
    xhr.send(JSON.stringify({ idToken: idToken }));
  }
  
  // Check if user is logged in
  firebase.auth().onAuthStateChanged(function(user) {
    if (user) {
     // messageElement.innerHTML = 'Logged in';
      console.log('User is logged in');
    } else {
      // User is logged out
      //messageElement.innerHTML = 'Not logged in';
      console.log('User is logged out');
    }
  });
};