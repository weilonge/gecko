/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Form Autofill field heuristics.
 */

"use strict";

this.EXPORTED_SYMBOLS = ["FormAutofillHeuristics"];

const {classes: Cc, interfaces: Ci, utils: Cu, results: Cr} = Components;

Cu.import("resource://formautofill/FormAutofillUtils.jsm");

this.log = null;
FormAutofillUtils.defineLazyLogGetter(this, this.EXPORTED_SYMBOLS[0]);

/**
 * Returns the autocomplete information of fields according to heuristics.
 */
this.FormAutofillHeuristics = {
  FIELD_GROUPS: {
    NAME: [
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
    TEL: ["tel"],
    EMAIL: ["email"],
  },

  RULES: null,

  getFormInfo(form) {
    if (!this.RULES) {
      let sandbox = {};
      let scriptLoader = Cc["@mozilla.org/moz/jssubscript-loader;1"]
                           .getService(Ci.mozIJSSubScriptLoader);
      const HEURISTICS_REGEXP = "chrome://formautofill/content/heuristicsRegexp.js";
      scriptLoader.loadSubScript(HEURISTICS_REGEXP, sandbox, "utf-8");
      Object.assign(this, sandbox.HeuristicsRegExp);
    }
    let fieldDetails = [];
    if (form.autocomplete == "off") {
      return [];
    }
    for (let element of form.elements) {
      // Exclude elements to which no autocomplete field has been assigned.
      let info = this.getInfo(element, fieldDetails);
      if (!info) {
        continue;
      }

      // Store the association between the field metadata and the element.
      if (fieldDetails.some(f => f.section == info.section &&
                                 f.addressType == info.addressType &&
                                 f.contactType == info.contactType &&
                                 f.fieldName == info.fieldName)) {
        // A field with the same identifier already exists.
        log.debug("Not collecting a field matching another with the same info:", info);
        continue;
      }

      let formatWithElement = {
        section: info.section,
        addressType: info.addressType,
        contactType: info.contactType,
        fieldName: info.fieldName,
        elementWeakRef: Cu.getWeakReference(element),
      };

      fieldDetails.push(formatWithElement);
    }

    return fieldDetails;
  },

  getInfo(element, fieldDetails) {
    if (!(element instanceof Ci.nsIDOMHTMLInputElement) ||
        !["text", "email", "tel"].includes(element.type) ||
        element.autocomplete == "off") {
      return null;
    }

    let info = element.getAutocompleteInfo();
    if (info && info.fieldName &&
        Object.keys(this.RULES).includes(info.fieldName)) {
      return info;
    }

    // "tel" type is used for ZIP code for some web site (e.g. HomeDepot,
    // BestBuy), so element.type is not for "tel" prediction.
    if (element.type == "email") {
      return {
        fieldName: "email",
        section: "",
        addressType: "",
        contactType: "",
      };
    }

    let existingFieldNames = fieldDetails ? fieldDetails.map(i => i.fieldName) : "";
    let verifyFieldName = (string) => {
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
      if (this.RULES.tel.test(string)) {
        result.fieldName = "tel";
        return result;
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
    };

    for (let elementString of [element.id, element.name]) {
      let fieldNameResult = verifyFieldName(elementString);
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
      let strings = FormAutofillUtils.extractElementStrings(label);
      for (let string of strings) {
        let fieldNameResult = verifyFieldName(string);
        if (fieldNameResult) {
          return fieldNameResult;
        }
      }
    }

    return null;
  },
};
