// What the page fetches from other sites — a script that counts the visits, the help form of Orka — is not part of
// what the tests check, and is not always within reach of where they run: it is answered here. The script, with
// nothing; the form, with a page that says how tall it is, as Orka's does (`orka_form_resize`: the frame follows).
// `target`: a browser context, or a page.
const FORM = '<!doctype html><meta charset="utf-8"><title>Contact form</title><body style="margin:0;font:14px sans-serif">'
  + '<form style="height:480px">(a stand-in for the form of Orka)</form>'
  + '<script>parent.postMessage({ action: "orka_form_resize", data: { height: 480 } }, "*");</script></body>';
export const stubOutside = async (target) => {
  await target.route(/^https:\/\/www\.ship-or-die\.com\//, (route) => route.fulfill({ contentType: 'application/javascript', body: '/* (not fetched in the tests) */' }));
  await target.route(/^https:\/\/widget\.orka\.chat\//, (route) => route.fulfill({ contentType: 'text/html; charset=utf-8', body: FORM }));
};
