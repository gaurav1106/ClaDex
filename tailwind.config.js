module.exports = {
  content: ['./src/renderer/**/*.{html,js,jsx}'],
  theme: {
    extend: {
      colors: {
        cladex: {
          ink: '#241f1a',
          paper: '#fffcf7',
          sand: '#f7f3eb',
          line: '#e6dac9',
          accent: '#d97757'
        }
      },
      boxShadow: {
        soft: '0 18px 50px rgba(78, 51, 27, 0.12)'
      }
    }
  },
  plugins: []
};
