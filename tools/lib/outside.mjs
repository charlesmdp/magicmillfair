// What the page fetches from other sites — a script that counts the visits — is not part of what the tests
// check, and is not always within reach of where they run: it is answered here, with nothing.
// `target`: a browser context, or a page.
export const stubOutside = (target) => target.route(/^https:\/\/www\.ship-or-die\.com\//, (route) => route.fulfill({ contentType: 'application/javascript', body: '/* (not fetched in the tests) */' }));
