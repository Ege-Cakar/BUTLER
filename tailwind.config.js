/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        'playfair': ['Playfair Display', 'serif'],
      },
      colors: {
        butler: {
          primary: '#B97724',    // Rich brown
          secondary: '#3C723E',  // Forest green
          accent: '#DEAF74',     // Warm beige
          dark: '#2A1B09',      // Dark brown
        },
      },
    },
  },
  plugins: [],
}
