/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: '#f8faf8',
        surface: '#ffffff',
        primary: '#1a4731',
        'primary-hover': '#22603f',
        accent: '#4a9668',
        'accent-soft': '#d4ead9',
        'accent-muted': '#a8d4b3',
        'text-dark': '#1c2b22',
        'text-muted': '#6b8f75',
        danger: '#c0392b',
        warning: '#d4a017',
        success: '#2d7a4f',
      },
      fontFamily: {
        sans: ['DM Sans', 'sans-serif'],
        serif: ['Fraunces', 'serif'],
      },
      borderRadius: {
        '10': '10px',
      },
    },
  },
  plugins: [],
};
