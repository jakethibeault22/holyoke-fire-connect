import './polyfills';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';

// Catch any errors
window.onerror = function(msg, url, lineNo, columnNo, error) {
  alert('Error: ' + msg + '\nLine: ' + lineNo);
  return false;
};

window.addEventListener('unhandledrejection', function(event) {
  alert('Unhandled rejection: ' + event.reason);
});

try {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
} catch (error) {
  alert('Render error: ' + error.message);
  document.body.innerHTML = '<h1>Error: ' + error.message + '</h1>';
}