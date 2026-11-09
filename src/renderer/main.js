import { createApp } from 'vue';
import '@fontsource-variable/ibm-plex-sans';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/ibm-plex-mono/latin-600.css';
import App from './App.vue';
import { initTheme } from './composables/useTheme.js';
import './index.css';

initTheme();
createApp(App).mount('#app');
