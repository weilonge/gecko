"use strict";

Cu.import("resource://formautofill/FormAutofillHeuristics.jsm");


function genCase(fieldName, maxLength) {
  return {
    fieldName: fieldName,
    elementWeakRef: {
      get() { return {maxLength: maxLength}; },
    }
  };
}

const TESTCASES = [
  {
    start: 2,
    end: 6,
    fieldDetails: [
      genCase("email", 10),
      genCase("email", 10),
      genCase("tel", 3),
      genCase("tel", 3),
      genCase("tel", 4),
      genCase("tel", 4),
      genCase("email", 10),
    ],
    expectedResult: [
      "email", "email", "tel-area-code", "tel-local-prefix", "tel-local-suffix", "tel", "email",
    ],
  },
  {
    start: 0,
    end: 3,
    fieldDetails: [
      genCase("tel", 3),
      genCase("tel", 3),
      genCase("tel", 4),
    ],
    expectedResult: [
      "tel-area-code", "tel-local-prefix", "tel-local-suffix",
    ],
  },
  {
    start: 1,
    end: 4,
    fieldDetails: [
      genCase("email", 10),
      genCase("tel", 3),
      genCase("tel", 3),
      genCase("tel", 4),
    ],
    expectedResult: [
      "email", "tel-area-code", "tel-local-prefix", "tel-local-suffix",
    ],
  },
  {
    start: 0,
    end: 3,
    fieldDetails: [
      genCase("tel", 3),
      genCase("tel", 3),
      genCase("tel", 4),
      genCase("email", 10),
    ],
    expectedResult: [
      "tel-area-code", "tel-local-prefix", "tel-local-suffix", "email",
    ],
  },
  {
    start: 1,
    end: 4,
    fieldDetails: [
      genCase("email", 10),
      genCase("tel", 3),
      genCase("tel", 3),
      genCase("tel", 4),
      genCase("email", 10),
    ],
    expectedResult: [
      "email", "tel-area-code", "tel-local-prefix", "tel-local-suffix", "email",
    ],
  },
];

TESTCASES.forEach(testcase => {
  add_task(function* () {
    let {fieldDetails, start, end, expectedResult} = testcase;
    do_print("Starting testcase: " + fieldDetails.map(i => i.fieldName));
    FormAutofillHeuristics._matchTelGrammar(fieldDetails,
                                            start,
                                            end);

    Assert.deepEqual(fieldDetails.map(i => i.fieldName), expectedResult);
  });
});
