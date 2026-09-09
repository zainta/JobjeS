/*

This file only exists to help eleviate some of the clutter that will be in the JobjeS.js

*/

/**
 * Checks to see if the given string is a valid regular expression
 * 
 * @param {String} regex A string to test for regular expression validity
 * @returns A boolean value indicating the result
 */
export function isRegex(regex) {
    if (typeof regex !== 'string') return false;

    let result = true;
    try {
        const re = new RegExp(regex);
    } catch (e) {
        result = false;
    }
    return result;
}

/**
 * From https://stackoverflow.com/a/175787
 * @param {String} str The string to test
 * @returns A boolean value indicating if this is a number
 */
export function isNumeric(str) {
  if (typeof str != "string") return false // we only process strings!  
  return !isNaN(str) && // use type coercion to parse the _entirety_ of the string (`parseFloat` alone does not do this)...
         !isNaN(parseFloat(str)) // ...and ensure strings of whitespace fail
}

/**
 * Takes a string and splits it on half at the first occurrance of the divider.  If the divider is not found, returns the original string.
 * 
 * @param {String} string The string to be split
 * @param {String} divider The text to split on the first instance of
 * @returns The split string, or the original if no instances of the divider are found.
 */
export function splitAtFirst(string, divider) {
    const position = string.indexOf(divider);
    if (position === -1) return string;

    return [string.substring(0, position), string.substring(position + 1)];
}

/**
 * Duplicates a structure in full except classes
 * @param {Array | object} unknown An object or array structure to duplicate in its entirety (omitting classes)
 * @returns The duplicated object
 */
export function duplicate(unknown) {
    let outcome;
    if (Array.isArray(unknown)) {
        outcome = cloneArr(unknown);
    } else if (unknown?.constructor == Object) {
        outcome = cloneDict(unknown);
    } else {
        outcome = unknown;
    }

    return outcome;
}

// loops through a dictionary and clones its keys/value pairs
const cloneDict = (dict) => {
    let outcome = {};

    for (let [key, value] of Object.entries(dict)) {
        if (Array.isArray(value)) {
            outcome[key] = cloneArr(value);
        } else if (value?.constructor == Object) {
            outcome[key] = cloneDict(value);
        } else {
            outcome[key] = value;
        }
    }

    return outcome;
}

// loops through an array and clones its values
const cloneArr = (arr) => {
    let outcome = [];

    for (let i = 0; i < arr.length; i++) {
        if (Array.isArray(arr[i])) {
            outcome.push(cloneArr(arr[i]));
        } else if (arr[i]?.constructor == Object) {
            outcome.push(cloneDict(arr[i]));
        } else {
            outcome.push(arr[i]);
        }
    }

    return outcome;
}

export function isValidKey(str) {
    // based on regex from https://codingtechroom.com/question/-javascript-variable-name-regex
    return /^[0-9a-zA-Z_$][0-9a-zA-Z _$]*$/.test(str);
}