/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#080D12',
        canvas: '#05090D',
        surface: '#101922',
        surface2: '#16212B',
        line: '#253542',
        line2: '#1A2833',
        ink: '#E7EEF4',
        mute: '#8A9CA9',
        dim: '#5D6F7C',
        cyan: '#40D8D0',
        gof: '#DDA45A',
        lof: '#6D9AE9',
        mixed: '#A58CE3',
        indet: '#7D8790',
        warn: '#D76F72',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        '2xs': ['10px', '14px'],
        xs: ['11px', '16px'],
        sm: ['12px', '17px'],
        base: ['13px', '19px'],
        md: ['14px', '20px'],
      },
      borderRadius: { DEFAULT: '3px', sm: '2px', md: '4px' },
    },
  },
  plugins: [],
};
