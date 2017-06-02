"use strict";

Cu.import("resource://formautofill/FormAutofillUtils.jsm");

const TESTCASES = [
  {
    document: `<input id="targetElement" type="text">`,
    fieldId: "targetElement",
    expectedResult: false,
  },
  {
    document: `<input id="targetElement" type="email">`,
    fieldId: "targetElement",
    expectedResult: false,
  },
  {
    document: `<input id="targetElement" name="searchPara">`,
    fieldId: "targetElement",
    expectedResult: true,
  },
  {
    document: `<input id="targetElementSearch" type="tel">`,
    fieldId: "targetElementSearch",
    expectedResult: true,
  },
  {
    document: `<input id="targetElement" type="search">`,
    fieldId: "targetElement",
    expectedResult: true,
  },
];

TESTCASES.forEach(testcase => {
  add_task(function* () {
    do_print("Starting testcase: " + testcase.document);

    let doc = MockDocument.createTestDocument(
      "http://localhost:8080/test/", testcase.document);

    let field = doc.getElementById(testcase.fieldId);
    Assert.equal(FormAutofillUtils.isInputForSearch(field),
                 testcase.expectedResult);
  });
});
