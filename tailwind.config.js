/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./*.html",
    "./js/**/*.js",
  ],
  theme: {
    extend: {
      colors: {
        accent: '#92229D',
        'accent-hover': '#67196F',
        'accent-light': '#C636D3',
        light: '#F8F3F2',
        'light-accent': '#E5D0CC',
        'light-accent-hover': '#DCC1BC',
        dark: '#003049',
        'dark-fade': '#004266',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
};
