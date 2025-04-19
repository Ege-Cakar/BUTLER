/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        butler: {
          primary: '#2563eb',
          secondary: '#475569',
          accent: '#3b82f6',
        },
      },
    },
  },
  plugins: [],
}
