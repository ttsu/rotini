/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        'ios-bg':       '#F2F2F7',
        'ios-card':     '#FFFFFF',
        'ios-sep':      'rgba(60,60,67,0.10)',
        'ios-border':   'rgba(60,60,67,0.12)',
        'ios-text-sec': '#636366',
        'ios-text-ter': '#AEAEB2',
        'status-green': '#34C759',
        'status-amber': '#FF9F0A',
      },
    },
  },
  plugins: [],
};
