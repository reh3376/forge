// This file prevents Next.js from trying to prerender error pages during build
// It overrides the default App Router error handling for /404 and /500
// This is a workaround for styled-jsx SSR hook conflicts during static generation

function Error({ statusCode }) {
  return null; // Return null - this page should never actually render
}

Error.getInitialProps = () => {
  return { statusCode: 404 };
};

export default Error;
