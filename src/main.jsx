import './polyfills';
import './index.css';
import React, { Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import DisplayBoard from './DisplayBoard.jsx';

// App is loaded lazily so the TV page never runs the main app's code
const App = React.lazy(() => import('./App.jsx'));

// The firehouse TV page lives at /display and must never pop up alert() boxes
const isDisplay = window.location.pathname.startsWith('/display');

if (!isDisplay) {
  window.onerror = function(msg, url, lineNo, columnNo, error) {
    alert('Error: ' + msg + '\nLine: ' + lineNo);
    return false;
  };

  window.addEventListener('unhandledrejection', function(event) {
    alert('Unhandled rejection: ' + event.reason);
  });
}

try {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      {isDisplay ? (
        <DisplayBoard />
      ) : (
        <Suspense fallback={null}>
          <App />
        </Suspense>
      )}
    </React.StrictMode>,
  );
} catch (error) {
  if (!isDisplay) alert('Render error: ' + error.message);
  document.body.innerHTML = '<h1>Error: ' + error.message + '</h1>';
}