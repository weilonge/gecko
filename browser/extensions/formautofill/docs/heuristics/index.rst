========================
Form Autofill Heuristics
========================

Form Autofill Heuristics module is for detecting the field type based on `autocomplete attribute <https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#autofill/>`_, `the regular expressions <http://searchfox.org/mozilla-central/source/browser/extensions/formautofill/content/heuristicsRegexp.js/>`_ and the customized logic in each parser.

Debugging
=========

Set the pref ``extensions.formautofill.loglevel`` to "Debug".

The pref ``extensions.formautofill.heuristics.enabled`` is "true" in default. Set it to "false" could be useful to verify the result of autocomplete attribute.

Dependent APIs
==============

``element.getAutocompleteInfo()`` provides the parsed result of "autocomplete" attribute which includes the field name and section information defined in `autofill spec <https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#autofill/>`_

The Regular Expression
======================

[WIP] This section is going to mention how the regular expression is applied during parsing fields.

Parser Implementation
=====================

The parsers are for detecting the field type more accurately based on the near context of a field. Each parser uses ``FieldScanner`` to traverse the interested fields with the result from the regular expressions and adjust each field type when it matches to a grammar.

* _parsePhoneFields - [WIP]
  * related type - tel, tel-*

* _parseAddressFields - [WIP]
  * related type - address-line[1-3]

* _parseCreditCardExpirationDateFields - [WIP]
  * related type - cc-exp, cc-exp-month, cc-exp-year

Report Issues
=============

If you find any issues about filling a form with incorrect values, please leave a comment in `bug 1405266 <https://bugzilla.mozilla.org/show_bug.cgi?id=1405266/>`_.


