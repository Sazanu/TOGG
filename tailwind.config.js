/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'Inter', 'sans-serif'],
      },
      colors: {
        // Royal purple — the "throne"
        royal: {
          50: '#f5f3fb', 100: '#ebe6f7', 200: '#d5cbee', 300: '#b5a3e0',
          400: '#9275cf', 500: '#7653bd', 600: '#5f3fa0', 700: '#4d3283',
          800: '#3c2766', 900: '#2b1c4a', 950: '#1b1030',
        },
        // Gold — the "grace"
        gold: {
          50: '#fdf9ec', 100: '#f9efcc', 200: '#f2dd95', 300: '#e9c65c',
          400: '#dfb037', 500: '#c99524', 600: '#a8741c', 700: '#86561b',
          800: '#6f461d', 900: '#5e3b1d',
        },
        cream: '#faf7f2',
      },
      boxShadow: {
        card: '0 1px 2px rgba(27,16,48,0.04), 0 4px 16px rgba(27,16,48,0.05)',
      },
    },
  },
  plugins: [],
};
