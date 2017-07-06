/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Form Autofill field heuristics.
 */

"use strict";

this.EXPORTED_SYMBOLS = ["FormAutofillHeuristics"];

const {classes: Cc, interfaces: Ci, utils: Cu, results: Cr} = Components;

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://formautofill/FormAutofillUtils.jsm");

this.log = null;
FormAutofillUtils.defineLazyLogGetter(this, this.EXPORTED_SYMBOLS[0]);

const PREF_HEURISTICS_ENABLED = "extensions.formautofill.heuristics.enabled";

class FieldScanner {
  constructor(elements, fieldDetails = []) {
    this._elementsWeakRef = Cu.getWeakReference(elements);
    this._fieldDetails = fieldDetails;
    this._indexParsing = 0;
  }

  get fieldDetails() {
    return this._fieldDetails;
  }

  get elements() {
    return this._elementsWeakRef.get();
  }

  get indexParsing() {
    return this._indexParsing;
  }

  set indexParsing(index) {
    if (index > this.fieldDetails.length) {
      log.warn("The parsing index is out of range.");
      index = this.fieldDetails.length;
    }
    this._indexParsing = index;
  }

  getFieldDetailByIndex(index) {
    if (index >= this.elements.length) {
      dump("\ngetFieldDetail return A\n");
      return null;
    }

    if (this.fieldDetails.length > index) {
      dump("\ngetFieldDetail return B: " + index + " " + this.fieldDetails.length + "\n");
      return this.fieldDetails[index];
    }

    for (let i = this.fieldDetails.length; i < index; i++) {
      if (!this.fieldDetails[i]) {
        let element = this.elements[i];
        this.pushDetail(i, FormAutofillHeuristics.getInfo(element));
      }
    }

    dump("\ngetFieldDetail return C: " + this.fieldDetails.length + "\n");
    return this.fieldDetails[index];
  }

  get parsingFinished() {
    return this.indexParsing >= this.elements.length;
  }

  pushDetail(elementIndex, info) {
    if (!info) {
      info = {};
    }
    let fieldInfo = {
      section: info.section,
      addressType: info.addressType,
      contactType: info.contactType,
      fieldName: info.fieldName,
      elementWeakRef: Cu.getWeakReference(this.elements[elementIndex]),
    };

    // Store the association between the field metadata and the element.
    if (this.findSameField(info) != -1) {
      // A field with the same identifier already exists.
      log.debug("Not collecting a field matching another with the same info:", info);
      fieldInfo._duplicated = true;
    }

    this._fieldDetails.push(fieldInfo);
  }

  updateFieldName(index, fieldName) {
    this.fieldDetails[index].fieldName = fieldName;

    delete this.fieldDetails[index]._duplicated;
    let indexSame = this.findSameField(this.fieldDetails[index]);
    if (indexSame != index && indexSame != -1) {
      this.fieldDetails[index]._duplicated = true;
    }
  }

  prepareForParsing() {
    if (!this.parsingFinished && this.indexParsing == this.fieldDetails.length) {
      let element = this.elements[this.indexParsing];
      this.pushDetail(this.indexParsing, FormAutofillHeuristics.getInfo(element));
    }
  }

  findSameField(info) {
    return this._fieldDetails.findIndex(f => f.section == info.section &&
                                        f.addressType == info.addressType &&
                                        f.contactType == info.contactType &&
                                        f.fieldName == info.fieldName);
  }

  get trimmedFieldDetail() {
    return this._fieldDetails.filter(f => f.fieldName && !f._duplicated);
  }
}

/**
 * Returns the autocomplete information of fields according to heuristics.
 */
this.FormAutofillHeuristics = {
  FIELD_GROUPS: {
    NAME: [
      "name",
      "given-name",
      "additional-name",
      "family-name",
    ],
    ADDRESS: [
      "organization",
      "street-address",
      "address-line1",
      "address-line2",
      "address-line3",
      "address-level2",
      "address-level1",
      "postal-code",
      "country",
    ],
    TEL: [
      "tel-extension",
      "tel",
    ],
    EMAIL: ["email"],
  },

  RULES: null,

  _parsePhoneFields(fieldScanner) {
    let matchingResult;

    const GRAMMARS = this.PHONE_FIELD_GRAMMARS;
    for (let i = 0; i < GRAMMARS.length; i++) {
      let detailStart = fieldScanner.indexParsing;
      let ruleStart = i;
      for (; i < GRAMMARS.length && GRAMMARS[i][0]; i++, detailStart++) {
        dump("\n_parsePhoneFields A: " + detailStart + "\n");
        let detail = fieldScanner.getFieldDetailByIndex(detailStart);
        if (detail) {
          dump("\n_parsePhoneFields B: " + detail.fieldName + "\n");
        }
        if (!detail || GRAMMARS[i][0] != detail.fieldName) {
          break;
        }
        let element = detail.elementWeakRef.get();
        if (element) {
          break;
        }
        dump("\n_parsePhoneFields C: " + detail.fieldName + " " + element.maxLength + "\n");
        if (GRAMMARS[i][2] && (!element.maxLength || GRAMMARS[i][2] < element.maxLength)) {
          break;
        }
      }
      if (i >= GRAMMARS.length) {
        break;
      }

      if (!GRAMMARS[i][0]) {
        matchingResult = {
          ruleFrom: ruleStart,
          ruleTo: i,
        };
        break;
      }

      // Fast rewinding to the next rule.
      for (; i < GRAMMARS.length; i++) {
        if (!GRAMMARS[i][0]) {
          break;
        }
      }
    }

    let parsedField = false;
    if (matchingResult) {
      let {ruleFrom, ruleTo} = matchingResult;
      let detailStart = fieldScanner.indexParsing;
      for (let i = ruleFrom; i < ruleTo; i++) {
        fieldScanner.updateFieldName(detailStart, GRAMMARS[i][1]);
        fieldScanner.indexParsing++;
        parsedField = true;
      }
    }

    /*
    let nextField = fieldScanner.getFieldDetailByIndex(fieldScanner.indexParsing);
    if (nextField && nextField.fieldName == "tel") {
      fieldScanner.updateFieldName(fieldScanner.indexParsing, "tel-extension");
      fieldScanner.indexParsing++;
    }
    */

    return parsedField;
  },

  _parseAddressFields(fieldScanner) {
    let parsedFields = false;
    let fieldDetails = fieldScanner.fieldDetails;
    let addressLines = ["address-line1", "address-line2", "address-line3"];
    for (let i = 1; !fieldScanner.parsingFinished && i < (addressLines.length + 1); i++) {
      // This is for ensuring the next field for parsing is ready.
      fieldScanner.prepareForParsing();

      let detail = fieldDetails[fieldScanner.indexParsing];
      if (!addressLines.includes(detail.fieldName)) {
        // When the field is not related to any address-line[1-3] fields, it
        // means the parsing process can be terminated.
        break;
      }
      let currentAddressLine = "address-line" + i;
      fieldScanner.updateFieldName(fieldScanner.indexParsing, currentAddressLine);
      fieldScanner.indexParsing++;
      parsedFields = true;
    }

    return parsedFields;
  },

  getFormInfo(form) {
    if (form.autocomplete == "off" || form.elements.length <= 0) {
      return [];
    }

    let fieldScanner = new FieldScanner(form.elements);
    while (!fieldScanner.parsingFinished) {
      let parsedPhoneFields = this._parsePhoneFields(fieldScanner);
      let parsedAddressFields = this._parseAddressFields(fieldScanner);

      // If there is no any field parsed, the parsing cursor can be moved
      // forward to the next one.
        dump("\nparse phone: " + parsedPhoneFields+ "\n");
        dump("\nparse address: " + parsedAddressFields+ "\n");
      if (!parsedPhoneFields && !parsedAddressFields) {
        fieldScanner.indexParsing++;
      }
    }
    for (let detail of fieldScanner.fieldDetails) {
      if (detail.fieldName) {
        dump("\n" + detail.fieldName + "\n");
      }
    }
    return fieldScanner.trimmedFieldDetail;
  },

  /**
   * Get the autocomplete info (e.g. fieldName) determined by the regexp
   * (this.RULES) matching to a feature string.
   *
   * @param {string} string a feature string to be determined.
   * @returns {Object}
   *          Provide the predicting result including the field name.
   *
   */
  _matchStringToFieldName(string) {
    let result = {
      fieldName: "",
      section: "",
      addressType: "",
      contactType: "",
    };
    if (this.RULES.email.test(string)) {
      result.fieldName = "email";
      return result;
    }
    for (let fieldName of this.FIELD_GROUPS.TEL) {
      if (this.RULES[fieldName].test(string)) {
        result.fieldName = fieldName;
        return result;
      }
    }
    for (let fieldName of this.FIELD_GROUPS.ADDRESS) {
      if (this.RULES[fieldName].test(string)) {
        result.fieldName = fieldName;
        return result;
      }
    }
    for (let fieldName of this.FIELD_GROUPS.NAME) {
      if (this.RULES[fieldName].test(string)) {
        result.fieldName = fieldName;
        return result;
      }
    }
    return null;
  },

  getInfo(element) {
    if (!FormAutofillUtils.isFieldEligibleForAutofill(element)) {
      return null;
    }

    let info = element.getAutocompleteInfo();
    // An input[autocomplete="on"] will not be early return here since it stll
    // needs to find the field name.
    if (info && info.fieldName && info.fieldName != "on") {
      return info;
    }

    if (!this._prefEnabled) {
      return null;
    }

    // "email" type of input is accurate for heuristics to determine its Email
    // field or not. However, "tel" type is used for ZIP code for some web site
    // (e.g. HomeDepot, BestBuy), so "tel" type should be not used for "tel"
    // prediction.
    if (element.type == "email") {
      return {
        fieldName: "email",
        section: "",
        addressType: "",
        contactType: "",
      };
    }

    for (let elementString of [element.id, element.name]) {
      let fieldNameResult = this._matchStringToFieldName(elementString);
      if (fieldNameResult) {
        return fieldNameResult;
      }
    }
    let labels = FormAutofillUtils.findLabelElements(element);
    if (!labels || labels.length == 0) {
      log.debug("No label found for", element);
      return null;
    }
    for (let label of labels) {
      let strings = FormAutofillUtils.extractLabelStrings(label);
      for (let string of strings) {
        let fieldNameResult = this._matchStringToFieldName(string);
        if (fieldNameResult) {
          return fieldNameResult;
        }
      }
    }

    return null;
  },

  PHONE_FIELD_GRAMMARS: [
    // Country code: <cc> Area Code: <ac> Phone: <phone> (- <suffix>

    // (Ext: <ext>)?)?
      // {REGEX_COUNTRY, FIELD_COUNTRY_CODE, 0},
      // {REGEX_AREA, FIELD_AREA_CODE, 0},
      // {REGEX_PHONE, FIELD_PHONE, 0},
      // {REGEX_SEPARATOR, FIELD_NONE, 0},

    // \( <ac> \) <phone>:3 <suffix>:4 (Ext: <ext>)?
      // {REGEX_AREA_NOTEXT, FIELD_AREA_CODE, 3},
      // {REGEX_PREFIX_SEPARATOR, FIELD_PHONE, 3},
      // {REGEX_PHONE, FIELD_SUFFIX, 4},
      // {REGEX_SEPARATOR, FIELD_NONE, 0},

    // Phone: <cc> <ac>:3 - <phone>:3 - <suffix>:4 (Ext: <ext>)?
      // {REGEX_PHONE, FIELD_COUNTRY_CODE, 0},
      // {REGEX_PHONE, FIELD_AREA_CODE, 3},
      // {REGEX_PREFIX_SEPARATOR, FIELD_PHONE, 3},
      // {REGEX_SUFFIX_SEPARATOR, FIELD_SUFFIX, 4},
      // {REGEX_SEPARATOR, FIELD_NONE, 0},

    // Phone: <cc>:3 <ac>:3 <phone>:3 <suffix>:4 (Ext: <ext>)?
    ["tel", "tel-country-code", 3],
    ["tel", "tel-area-code", 3],
    ["tel", "tel-local-prefix", 3],
    ["tel", "tel-local-suffix", 4],
    [null, null, 0],

    // Area Code: <ac> Phone: <phone> (- <suffix> (Ext: <ext>)?)?
      // {REGEX_AREA, FIELD_AREA_CODE, 0},
      // {REGEX_PHONE, FIELD_PHONE, 0},
      // {REGEX_SEPARATOR, FIELD_NONE, 0},

    // Phone: <ac> <phone>:3 <suffix>:4 (Ext: <ext>)?
      // {REGEX_PHONE, FIELD_AREA_CODE, 0},
      // {REGEX_PHONE, FIELD_PHONE, 3},
      // {REGEX_PHONE, FIELD_SUFFIX, 4},
      // {REGEX_SEPARATOR, FIELD_NONE, 0},

    // Phone: <cc> \( <ac> \) <phone> (- <suffix> (Ext: <ext>)?)?
      // {REGEX_PHONE, FIELD_COUNTRY_CODE, 0},
      // {REGEX_AREA_NOTEXT, FIELD_AREA_CODE, 0},
      // {REGEX_PREFIX_SEPARATOR, FIELD_PHONE, 0},
      // {REGEX_SEPARATOR, FIELD_NONE, 0},

    // Phone: \( <ac> \) <phone> (- <suffix> (Ext: <ext>)?)?
      // {REGEX_PHONE, FIELD_COUNTRY_CODE, 0},
      // {REGEX_AREA_NOTEXT, FIELD_AREA_CODE, 0},
      // {REGEX_PREFIX_SEPARATOR, FIELD_PHONE, 0},
      // {REGEX_SEPARATOR, FIELD_NONE, 0},

    // Phone: <cc> - <ac> - <phone> - <suffix> (Ext: <ext>)?
      // {REGEX_PHONE, FIELD_COUNTRY_CODE, 0},
      // {REGEX_PREFIX_SEPARATOR, FIELD_AREA_CODE, 0},
      // {REGEX_PREFIX_SEPARATOR, FIELD_PHONE, 0},
      // {REGEX_SUFFIX_SEPARATOR, FIELD_SUFFIX, 0},
      // {REGEX_SEPARATOR, FIELD_NONE, 0},

    // Area code: <ac>:3 Prefix: <prefix>:3 Suffix: <suffix>:4 (Ext: <ext>)?
      // {REGEX_AREA, FIELD_AREA_CODE, 3},
      // {REGEX_PREFIX, FIELD_PHONE, 3},
      // {REGEX_SUFFIX, FIELD_SUFFIX, 4},
      // {REGEX_SEPARATOR, FIELD_NONE, 0},

    // Phone: <ac> Prefix: <phone> Suffix: <suffix> (Ext: <ext>)?
      // {REGEX_PHONE, FIELD_AREA_CODE, 0},
      // {REGEX_PREFIX, FIELD_PHONE, 0},
      // {REGEX_SUFFIX, FIELD_SUFFIX, 0},
      // {REGEX_SEPARATOR, FIELD_NONE, 0},

    // Phone: <ac> - <phone>:3 - <suffix>:4 (Ext: <ext>)?
    ["tel", "tel-area-code", 0],
    ["tel", "tel-local-prefix", 3],
    ["tel", "tel-local-suffix", 4],
    [null, null, 0],

    // Phone: <cc> - <ac> - <phone> (Ext: <ext>)?
      // {REGEX_PHONE, FIELD_COUNTRY_CODE, 0},
      // {REGEX_PREFIX_SEPARATOR, FIELD_AREA_CODE, 0},
      // {REGEX_SUFFIX_SEPARATOR, FIELD_PHONE, 0},
      // {REGEX_SEPARATOR, FIELD_NONE, 0},

    // Phone: <ac> - <phone> (Ext: <ext>)?
      // {REGEX_AREA, FIELD_AREA_CODE, 0},
      // {REGEX_PHONE, FIELD_PHONE, 0},
      // {REGEX_SEPARATOR, FIELD_NONE, 0},

    // Phone: <cc>:3 - <phone>:10 (Ext: <ext>)?
      // {REGEX_PHONE, FIELD_COUNTRY_CODE, 3},
      // {REGEX_PHONE, FIELD_PHONE, 10},
      // {REGEX_SEPARATOR, FIELD_NONE, 0},

    // Ext: <ext>
      // {REGEX_EXTENSION, FIELD_EXTENSION, 0},
      // {REGEX_SEPARATOR, FIELD_NONE, 0},

    // Phone: <phone> (Ext: <ext>)?
      // {REGEX_PHONE, FIELD_PHONE, 0},
      // {REGEX_SEPARATOR, FIELD_NONE, 0},
  ],
};

XPCOMUtils.defineLazyGetter(this.FormAutofillHeuristics, "RULES", () => {
  let sandbox = {};
  let scriptLoader = Cc["@mozilla.org/moz/jssubscript-loader;1"]
                       .getService(Ci.mozIJSSubScriptLoader);
  const HEURISTICS_REGEXP = "chrome://formautofill/content/heuristicsRegexp.js";
  scriptLoader.loadSubScript(HEURISTICS_REGEXP, sandbox, "utf-8");
  return sandbox.HeuristicsRegExp.RULES;
});

XPCOMUtils.defineLazyGetter(this.FormAutofillHeuristics, "_prefEnabled", () => {
  return Services.prefs.getBoolPref(PREF_HEURISTICS_ENABLED);
});

Services.prefs.addObserver(PREF_HEURISTICS_ENABLED, () => {
  this.FormAutofillHeuristics._prefEnabled = Services.prefs.getBoolPref(PREF_HEURISTICS_ENABLED);
});

