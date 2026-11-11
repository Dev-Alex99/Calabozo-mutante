/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        cinzel: ['Cinzel', 'serif'],
        medieval: ['MedievalSharp', 'cursive'],
        sans: ['Inter', 'sans-serif'],
      },
      colors: {
        grimoire: {
          bg: '#0c0a09',        // deep dark stone
          stone: '#1c1917',     // chiseled slate
          stoneLight: '#292524',
          border: '#44403c',    // weathered iron
          gold: '#d97706',      // tarnished gold
          goldBright: '#f59e0b',
          parchment: '#fef3c7', // aged parchment
          blood: '#991b1b',     // dried blood
          bloodDark: '#450a0a',
          emerald: '#15803d',
          arcane: '#6b21a8',
        },
      },
      boxShadow: {
        'torch': '0 0 25px rgba(217, 119, 6, 0.25)',
        'blood': '0 0 25px rgba(153, 27, 27, 0.35)',
        'iron': '0 4px 20px rgba(0, 0, 0, 0.8)',
      },
    },
  },
  plugins: [],
};
