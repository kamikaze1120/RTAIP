/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './src/**/*.{ts,tsx,js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        cyan: {
          500: '#06b6d4',
        },
        violet: {
          500: '#8b5cf6',
        },
        fuchsia: {
          500: '#d946ef',
        },
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};