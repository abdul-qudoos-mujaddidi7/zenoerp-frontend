import { mount } from 'svelte'
import App from './App.svelte'
import { db } from './db.js'
import { ensureProductUnitsLoaded } from './pages/stocktransactions/calculateStock.js'
import './app.css'
import './components/common/quick-action-modal.css'
import './components/common/track-picker.css'
import { initGlobalDatePickers } from './calendar.js'

db.open()
  .then(() => ensureProductUnitsLoaded())
  .catch((error) => {
  console.error('Failed to open local database:', error);
});

const dir = localStorage.getItem('dir') || 'ltr';
document.documentElement.setAttribute('dir', dir);

const mdbCss = document.getElementById('mdb-css');
const mdbRtlCss = document.getElementById('mdb-rtl-css');
if (mdbCss) mdbCss.disabled = dir === 'rtl';
if (mdbRtlCss) mdbRtlCss.disabled = dir !== 'rtl';

const app = mount(App, {
  target: document.getElementById('app'),
  intro: true,
})

initGlobalDatePickers()

export default app
