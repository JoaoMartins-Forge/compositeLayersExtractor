import { initViewer, loadModel } from './viewer.js';
import { initTree } from './sidebar.js';

const login = document.getElementById('login');

const jobs = document.getElementById('jobs');
jobs.onclick = () => {
  window.open(
    '/jobs',
    '_blank' // <- This is what makes it open in a new window.
  );
};

const urns = document.getElementById('urns');
urns.onclick = () => {
  window.open(
    '/urns',
    '_blank' // <- This is what makes it open in a new window.
  );
};

const carbons = document.getElementById('carbons');
carbons.onclick = () => {
  window.open(
    '/carbons',
    '_blank' // <- This is what makes it open in a new window.
  );
};

try {
  const resp = await fetch('/api/auth/profile', { mode: 'cors' });
  if (resp.ok) {
    const user = await resp.json();
    login.innerText = `Logout (${user.name})`;
    login.onclick = () => window.location.replace('/api/auth/logout');
    const viewer = await initViewer(document.getElementById('preview'));
    // initTree('#tree', (id) => loadModel(viewer, window.btoa(id).replace(/=/g, '')));
    initTree('#tree', (id, viewableguid) => loadModel(viewer, id.replace(/=/g, ''), viewableguid));
  } else {
    login.innerText = 'Login';
    login.onclick = () => window.location.replace('/api/auth/login');
  }
  login.style.visibility = 'visible';
} catch (err) {
  alert('Could not initialize the application. See console for more details.');
  console.error(err);
}