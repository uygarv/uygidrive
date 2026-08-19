function request(url, idToken) {
    const xhr = new XMLHttpRequest();

    xhr.open('POST', url, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onload = function () {
      console.log(xhr.responseText)
      
      if (JSON.parse(xhr.responseText).status = "success") {
        window.location.replace("/drive");
      }
    }
    xhr.send(JSON.stringify({ idToken: idToken }));
  }

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
  
  const messageElement = document.getElementById('message');
  // Log in with email and password
  const loginForm = document.getElementById('login');
  
  loginForm.addEventListener('submit', e => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    messageElement.innerHTML = "Logging in..."
    
    firebase.auth().signInWithEmailAndPassword(email, password)
      .then(({user}) => {
        return user.getIdToken().then(idToken => {
          request("/sessionLogin", idToken)
        });
      })
      .catch(function(error) {
        console.log(error);
        if (error.code === 'auth/internal-error') {
          messageElement.innerHTML = 'Invalid password';
        } else {
          messageElement.innerHTML = error.message;
        }
      });
  });
};

function logout() {
  request("/sessionLogout")
}