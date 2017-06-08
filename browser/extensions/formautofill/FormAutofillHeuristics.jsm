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

  _parseAndFillWithRegexp(fieldDetail, fieldName) {
    let element = fieldDetail.elementWeakRef.get();

    for (let elementString of [element.id, element.name]) {
      if (this.RULES[fieldName].test(elementString)) {
        fieldDetail.fieldName = fieldName;
        return;
      }
    }

    let labels = FormAutofillUtils.findLabelElements(element);
    if (!labels || labels.length == 0) {
      log.debug("No label found for", element);
    } else {
      for (let label of labels) {
        let strings = FormAutofillUtils.extractLabelStrings(label);
        dump(strings + "\n");
        for (let string of strings) {
          if (this.RULES[fieldName].test(string)) {
            fieldDetail.fieldName = fieldName;
            return;
          }
        }
      }
    }
  },

  _matchTelGrammar(fieldDetails, start, end) {
    dump("[" + start + " " + end + " " + fieldDetails.length + "]\n");
    const GRAMMARS = this.PHONE_FIELD_GRAMMARS;

    for (let i = 0;  i < GRAMMARS.length; i++) {
      // Reset the cursor of fieldDetails to the begin.
      let cursor = start;

      let ruleStart = i;
      for (; i < GRAMMARS.length && GRAMMARS[i][0]; i++, cursor++) {
        if (!fieldDetails[cursor]) {
          break;
        }
        let element = fieldDetails[cursor].elementWeakRef.get();
        dump(fieldDetails[cursor].elementWeakRef.get());
        dump("\n element: " + element.maxLength + " " + fieldDetails[cursor].fieldName + "\n");
        if (GRAMMARS[i][0] != fieldDetails[cursor].fieldName) {
          break;
        }
        if (GRAMMARS[i][2] && (!element.maxLength || GRAMMARS[i][2] < element.maxLength)) {
          break;
        }
      }
      if (i >= GRAMMARS.length) {
        return;
      }

      if (!GRAMMARS[i][0]) {
        dump("Found rules at " + i + " to " + (i - ruleStart) + "\n");
        let detailCursor = start;
        for (let j = ruleStart; j < i; j++, detailCursor++) {
          let rule = GRAMMARS[j];
          dump(rule + "\n");
          fieldDetails[detailCursor].fieldName = rule[1];
        }
        dump("END: " + detailCursor + " " + end + "\n");
        if (detailCursor <= end) {
          // Some fields are not matched to a rule yet, so let's see if it's
          // a tel-extension field.
          this._parseAndFillWithRegexp(fieldDetails[detailCursor],
                                       "tel-extension");
        }
        return;
      }

      // Fast rewinding to the next rule."
      for (; i < GRAMMARS.length; i++) {
        if (!GRAMMARS[i][0]) {
          break;
        }
      }
    }

  },

  _parseTelFields(elements, cursor, fieldDetails) {
    let indexNotTel;
    let detailBegin = fieldDetails.length - 1;
    let detailEnd = detailBegin;
    for (let i = cursor + 1; i < elements.length; i++) {
      let element = elements[i];
      let info = this.getInfo(element, fieldDetails);
      if (!info) {
        break;
      }
      fieldDetails.push({
        section: info.section,
        addressType: info.addressType,
        contactType: info.contactType,
        fieldName: info.fieldName,
        elementWeakRef: Cu.getWeakReference(element),
      });
      if (info.fieldName == "tel") {
        detailEnd++;
        continue;
      } else {
        indexNotTel = i;
        break;
      }
    }

    // Dedup the same tel fields between [cursor, indexNotTel)
    // Match to grammar list here.
    this._matchTelGrammar(fieldDetails, detailBegin, detailEnd);
    return indexNotTel;
  },

  getFormInfo(form) {
    let fieldDetails = [];
    if (form.autocomplete == "off") {
      return [];
    }
    dump("#elements " + form.elements.length + "\n");
    for (let i = 0; i < form.elements.length; i++) {
      let element = form.elements[i];
      // FIXME there is a potential performance issue here.
      //if(fieldDetails.some(f => {f.elementWeakRef.get() == element})) {
      //  dump("found " + i);
      //  continue;
      //}

      // Exclude elements to which no autocomplete field has been assigned.
      let info = this.getInfo(element, fieldDetails);
      if (!info) {
        continue;
      }

      if (info.fieldName == "tel") {
        // Push the current info to fieldDetails
        fieldDetails.push({
          section: info.section,
          addressType: info.addressType,
          contactType: info.contactType,
          fieldName: info.fieldName,
          elementWeakRef: Cu.getWeakReference(element),
        });
        dump("enter to _parseTelFields " + i + "\n");
        let indexNotTel = this._parseTelFields(form.elements, i, fieldDetails);
        i = indexNotTel;
      } else {
        // Store the association between the field metadata and the element.
        if (fieldDetails.some(f => f.section == info.section &&
                                   f.addressType == info.addressType &&
                                   f.contactType == info.contactType &&
                                   f.fieldName == info.fieldName)) {
          // A field with the same identifier already exists.
          log.debug("Not collecting a field matching another with the same info:", info);
          continue;
        }

        fieldDetails.push({
          section: info.section,
          addressType: info.addressType,
          contactType: info.contactType,
          fieldName: info.fieldName,
          elementWeakRef: Cu.getWeakReference(element),
        });
      }
    }

    return fieldDetails;
  },

  /**
   * Get the autocomplete info (e.g. fieldName) determined by the regexp
   * (this.RULES) matching to a feature string. The result is based on the
   * existing field names to prevent duplicating predictions
   * (e.g. address-line[1-3).
   *
   * @param {string} string a feature string to be determined.
   * @param {Array<string>} existingFieldNames the array of exising field names
   *                        in a form.
   * @returns {Object}
   *          Provide the predicting result including the field name.
   *
   */
  _matchStringToFieldName(string, existingFieldNames) {
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
        // If "address-line1" or "address-line2" exist already, the string
        // could be satisfied with "address-line2" or "address-line3".
        if ((fieldName == "address-line1" &&
            existingFieldNames.includes("address-line1")) ||
            (fieldName == "address-line2" &&
            existingFieldNames.includes("address-line2"))) {
          continue;
        }
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

  getInfo(element, fieldDetails) {
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

    let existingFieldNames = fieldDetails ? fieldDetails.map(i => i.fieldName) : "";

    for (let elementString of [element.id, element.name]) {
      let fieldNameResult = this._matchStringToFieldName(elementString,
                                                         existingFieldNames);
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
        let fieldNameResult = this._matchStringToFieldName(string,
                                                           existingFieldNames);
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
    ["tel", "tel-area-code", 0],
    ["tel", "tel-local-prefix", 3],
    ["tel", "tel-local-suffix", 4],
    [null, null, 0],

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
      // {REGEX_PHONE, FIELD_AREA_CODE, 0},
      // {REGEX_PREFIX_SEPARATOR, FIELD_PHONE, 3},
      // {REGEX_SUFFIX_SEPARATOR, FIELD_SUFFIX, 4},
      // {REGEX_SEPARATOR, FIELD_NONE, 0},

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

