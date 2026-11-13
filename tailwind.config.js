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
        // Church blue — from the globe in the TOGG Ministries logo (#3FBCE8)
        royal: {
          50: '#effafe', 100: '#dcf2fc', 200: '#b6e4f8', 300: '#7dd0f1', 400: '#3fbce8',
          500: '#1a9fd2', 600: '#0f80b0', 700: '#0e668e', 800: '#0f5274', 900: '#0f4361',
          950: '#0a2b40',
        },
        // Gold — from the throne in the logo (#C69A3D)
        gold: {
          50: '#fcf8ee', 100: '#f7edd2', 200: '#efd9a3', 300: '#e4c06c', 400: '#d6a948',
          500: '#c69a3d', 600: '#a87c2c', 700: '#875f25', 800: '#6f4d24', 900: '#5d4122',
        },
        cream: '#f7fafc',
      },
      boxShadow: {
        card: '0 1px 2px rgba(27,16,48,0.04), 0 4px 16px rgba(27,16,48,0.05)',
      },
    },
  },
  plugins: [],
};
