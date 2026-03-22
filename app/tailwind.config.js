/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cream: '#F5F0E8',
        terracotta: '#C4622D',
        amber: '#D4884A',
        charcoal: '#2C2C2C',
        'charcoal-light': '#4A4A4A',
        sand: '#E8DDD0',
        'sand-dark': '#D4C5B0',
        green: '#2D7A4A',
        red: '#C42D2D',
      },
      fontFamily: {
        display: ['Playfair Display', 'Georgia', 'serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
