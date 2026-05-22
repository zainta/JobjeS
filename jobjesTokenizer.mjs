import { JobjeSTokeGenerator, TokeFamilies, TokeTypes } from "./jobjesTokeGenerator.mjs";
import { duplicate, isJSIdentifier, isRegex } from "./jobjesUtility.mjs";

/*
Copyright (C) Zain T. Al-Ahmary

MIT license.  I am not response for how you use or what happens as a result of what you use this for.
*/

/**
 * Represents every possible type of tokens
 */
export const TokenTypes = {
    separator: 'separator',
    divider: 'divider',
    regex: 'regex', // a regular expression
    key: 'key',  // a piece of text meant to represent a property name

    exists: '!!', // !!
    notexists: '!', // !
    any: '*', // *
    anyAtAll: '**', // **

    or: '||', // ||, used in conditions to denote that either option can be true
    and: '&&', // &&, used in conditions to denote that both options must be true
    negativeValue: 'negValue', // !, when used preceding a value, indicates that the value cannot equal that
    positiveValue: 'posValue', // !!, a value is anything between a divider and the next separator or conditional operator (||, &&)

    parenthetical: 'parenthetical', // a condition or subquery within a set of parenthesis
    condition: 'condition', // a condition, possibly in a sequence of them
    pathRun: 'pathRun' // a path run is a path defined inside of a condition.  It indicates that that path must resolve correctly (resulting in a resolution of 'true')
}

export const TokenSubTypes = {
    none: "N/A", // this token type does not have sub types
    nestedCondition: "nestedCondition",  // of the form:  <expectation>  (no key association or divider)
    fullCondition: "fullCondition", // of the form  <key>:<value expection>
    positiveKey: "posKey", // preceded by nothing or the exists operator (!!)
    negativeKey: "negKey", // preceded by the not exists operataor (!)
    function: "function", // a function call (of the form: <key>;<parameter bundle name>)
}

/**
 * This class handles tokenizing the queries given to the JobjeS system
 */
export class JobjeSTokenizer {
    #tokens;
    #work;
    #index;
    #log;
    #parameterDictionary;

    /**
     * Create a tokenizer instance
     * @param {object} paramDictionary A dictionary of key->parameter array sets for use with any function calls
     */
    constructor(paramDictionary) {
        this.#parameterDictionary = paramDictionary;
    }

    /**
     * Returns the tokenization error log from the last attempt
     * @returns An array containing any errors encountered during tokenization of the provided query
     */
    log() {
        return this.#log;
    }

    /**
     * Returns the tokens generated during the last Tokenize call
     * @returns Returns the tokens from the last attempt
     */
    tokens() {
        return this.#tokens;
    }

    /**
     * Indicates is the error log is populated
     * @returns A boolean value representing if there are any errors
     */
    error() {
        return this.#log.length > 0;
    }

    /**
     * Takes a query string, the separator, and divider and produces tokens for the main class to consume
     * 
     * @param {String} query The query to tokenizer
     * @param {String} divider The divider is the character(s) that represent the border between the two halves of a Condition definition
     * @param {String} separator The separator is the character(s) that represent the border between components in a query path
     */
    Tokenize(query, divider, separator) {
        if (typeof query !== 'string' && query.length > 0) return [];
        if (typeof divider !== 'string' && divider.length > 0) return [];
        if (typeof separator !== 'string' && separator.length > 0) return [];
        if (separator === divider) return [];

        const toker = new JobjeSTokeGenerator().Tokize(query, divider, separator);

        if (toker.error()) {
            this.#log = [
                ...toker.log(),
                { index: -1, reason: 'Toker generated errors.  See previous.' }
            ];
        } else {
            this.#tokens = [];
            this.#work = toker.tokens();
            this.#index = 0;
            this.#log = [];

            // we already have tokes, so we're going to loop through and assemble full tokens for the main class to interpret
            // this will create arrangements that make solving easier, and should make the code simpler in the long run
            while (this.#end() === false && this.error() === false) {
                if (this.#peek().type === TokeTypes.openParenthesis) {
                    this.#handleParenthetical();
                } else if (this.#peek(1).type === TokeTypes.divider) {
                    this.#handleCondition();
                } else if (this.#peek().family === TokeFamilies.expression) {
                    this.#handleNestedCondition();
                } else if (this.#peek().family === TokeFamilies.key) {
                    this.#handlePathRun();
                } else if (this.#peek().family === TokeFamilies.operator) {
                    this.#handleOperator();
                } else {
                    this.#handleCopyOver();
                }
            }
        }

        return this.#tokens;
    }

    /**
     * Calculates the true index value (i.e. character index) and returns it
     * @param {Number} index The absolute index to start from.  If not provided, defaults to the current this.#index value
     */
    #getIndex(index = -1) {
        const destination = index === -1 ? this.#index : index;

        const set = this.#work.slice(0, destination);
        let realIndex = 0;
        for (let i = 0; i < set.length; i++) {
            realIndex += set[i].content.length;

            if (set[i].type === TokeTypes.regex) {
                realIndex += 2; // the delimiters
            } else if (set[i].type === TokeTypes.value) {
                realIndex += 2; // the delimiters
            }
        }

        return realIndex;
    }

    /**
     * Retrieves and removes the indicated characters from the #work array
     * @param {Number} offset The number of characters from the current index to start at
     * @param {Number} length The number of characters to gather up to
     * @returns The resulting string
     */
    #pop(offset = 0, length = 1) {
        const result = this.#work.slice(this.#index + offset, this.#index + offset + length);
        this.#index += offset + length;
        return result.length === 1 ? result[0] : result;
    }

    /**
     * Retrieves (but doesn't remove) the indicated characters from the #work array
     * @param {Number} offset The number of characters from the current index to start at
     * @param {Number} length The number of characters to gather up to
     * @returns The resulting string
     */
    #peek(offset = 0, length = 1) {
        const result = this.#work.slice(this.#index + offset, this.#index + offset + length);
        return result.length === 1 ? result[0] : result;
    }

    /**
     * Increments the index by the given number of characters.  Will not go beyond the end of the array
     * @param {Number} count 
     */
    #delete(count = 1) {
        const result = this.#work.slice(this.#index, this.#index + count);
        this.#index = this.#index + count;
        return result.length === 1 ? result[0] : result;
    }

    /**
     * Adds the token to the internal toke list
     * @param {object} Toke the toke to add 
     */
    #post(token) {
        this.#tokens.push(token);
    }

    /**
     * Returns a boolean value indicating if the index is pointing to the end of the work array
     * @returns If at the end, true, false otherwise.
     */
    #end() {
        return this.#index >= this.#work.length;
    }

    /**
     * Executes the given method and stores its result in set upon success, logs the given error upon failure
     * @param {Array} set The set to add the result to upon success
     * @param {Function} method The method to call to get results from
     * @param {Array} parameters The parameters to pass to the method
     * @param {String} errorMessage The error message to log upon failure
     */
    #addTo(set, method, parameters, errorMessage) {
        if (Array.isArray(set) === false) return;
        if (typeof method !== 'function') return;

        const originPoint = this.#index;

        const result = !!parameters && Array.isArray(parameters) ? method(...parameters, this) : method();
        if (this.error()) {
            this.#log.push({
                index: this.#getIndex(originPoint),
                reason: errorMessage
            });
        } else {
            set.push(result);
        }
    }

    #handleParenthetical(precedingOperator, inline = false, that) {
        const focus = (() => {
            return !!this ? this : that
        })();
        const origIndex = focus.#index;

        let product = {
            type: TokenTypes.parenthetical,
            subType: TokenSubTypes.none,
            content: []
        }
        if (!!precedingOperator) product.precedingOperator = precedingOperator;

        let outcome = undefined;
        if (focus.#peek().type === TokeTypes.openParenthesis) {
            focus.#delete();

            while (focus.#end() === false && focus.#peek().type !== TokeTypes.closeParenthesis) {
                if (focus.#peek().type === TokeTypes.openParenthesis) {
                    focus.#addTo(
                        product.content,
                        focus.#handleParenthetical,
                        [undefined, true],
                        `Failed to extract nested parenthetical.`
                    );
                } else if (focus.#peek(1).type === TokeTypes.divider) {
                    focus.#addTo(
                        product.content,
                        focus.#handleCondition,
                        [undefined, true],
                        `Failed to extract condition.`
                    );
                } else if (focus.#peek().family === TokeFamilies.expression) {
                    focus.#addTo(
                        product.content,
                        focus.#handleNestedCondition,
                        [undefined, true],
                        `Failed to extract nested condition.`
                    );
                } else if (focus.#peek().family === TokeFamilies.key) {
                    focus.#addTo(
                        product.content,
                        focus.#handlePathRun,
                        [undefined, true],
                        `Failed to extract conditional path.`
                    );
                } else if (focus.#peek().family === TokeFamilies.operator) {
                    focus.#addTo(
                        product.content,
                        focus.#handleOperator,
                        [true],
                        `Failed to extract operator and focus.`
                    );
                } else if (focus.#peek().type === TokeTypes.separator) {
                    // just copy it over after stripping the family
                    let toke = focus.#delete();
                    delete toke.family;

                    product.content.push(toke);
                } else {
                    focus.#log.push({
                        index: focus.#getIndex(focus.#index),
                        reason: `Unexpected toke '${focus.#peek().content}'.`
                    });
                    break;
                }
            }

            if (focus.#peek().type === TokeTypes.closeParenthesis) {
                focus.#delete();
            } else {
                focus.#log.push({
                    index: focus.#getIndex(origIndex),
                    reason: `Expected ')', but got '${focus.#peek().content}' instead.`
                });
            }

            if (focus.error() === false) {
                outcome = product;

                if (inline === false) {
                    focus.#post(outcome);
                }
            }
        } else {
            focus.#log.push({
                index: focus.#getIndex(origIndex),
                reason: `Expected '(', but got '${focus.#peek().content}' instead.`
            });
        }

        return outcome;
    }

    #handleCondition(precedingOperator, inline = false, that) {
        const focus = (() => {
            return !!this ? this : that
        })();
        const origIndex = focus.#index;

        let product = {
            type: TokenTypes.condition,
            subType: TokenSubTypes.fullCondition,
            content: []
        }
        if (!!precedingOperator) product.precedingOperator = precedingOperator;

        let outcome = undefined;
        if (focus.#peek().type === TokeTypes.key && focus.#peek(1).type === TokeTypes.divider) {
            product.content.push(focus.#delete());
            product.content.push(focus.#delete());

            while (
                focus.#end() === false && focus.#peek().family === TokeFamilies.expression && focus.#peek().type !== TokeTypes.closeParenthesis) {
                if (focus.#peek().type === TokeTypes.openParenthesis) {
                    focus.#addTo(
                        product.content,
                        focus.#handleParenthetical,
                        [undefined, true],
                        `Failed to extract parenthetical.`
                    );
                } else {
                    focus.#addTo(
                        product.content,
                        focus.#handleNestedCondition,
                        [undefined, true],
                        `Failed to extract nested condition.`
                    );
                }
            }
        } else {
            focus.#log.push({
                index: focus.#getIndex(origIndex),
                reason: `Divider expected, but got '${focus.#peek().content}' instead.`
            });
        }

        if (focus.error() === false) {
            outcome = product;

            if (inline === false) {
                focus.#post(outcome);
            }
        }

        return outcome;
    }

    #handleNestedCondition(precedingOperator, inline = false, that) {
        const focus = (() => {
            return !!this ? this : that
        })();
        const origIndex = focus.#index;

        let product = {
            type: TokenTypes.condition,
            subType: TokenSubTypes.nestedCondition,
            content: []
        }
        if (!!precedingOperator) product.precedingOperator = precedingOperator;

        let outcome = undefined;
        if (focus.#peek().family === TokeFamilies.expression) {
            while (focus.#end() === false && focus.#peek().family === TokeFamilies.expression && focus.#peek().type !== TokeTypes.closeParenthesis) {
                if (focus.#peek().type === TokeTypes.openParenthesis) {
                    focus.#addTo(
                        product.content,
                        focus.#handleParenthetical,
                        [undefined, true],
                        `Failed to extract nested parenthetical.`
                    );
                } else if (focus.#peek().type === TokeTypes.negative) {
                    if (focus.#peek().type === TokeTypes.negative && (
                        focus.#peek(1).type === TokeTypes.value ||
                        focus.#peek(1).type === TokeTypes.number ||
                        focus.#peek(1).type === TokeTypes.true ||
                        focus.#peek(1).type === TokeTypes.false ||
                        focus.#peek(1).type === TokeTypes.key)) {

                        focus.#delete(); // eat the negative notation
                        if (focus.#peek().type === TokeTypes.key) {
                            product.content.push({
                                type: TokenTypes.key,
                                subType: TokenSubTypes.negativeKey,
                                content: focus.#delete().content // keep the value
                            });
                        } else {
                            product.content.push({
                                type: TokenTypes.negativeValue,
                                subType: TokenSubTypes.none,
                                content: focus.#delete().content // keep the value
                            });
                        }
                    } else {
                        product.content.push({
                            type: TokenTypes.notexists,
                            subType: TokenSubTypes.none,
                            content: focus.#delete().content
                        });
                    }
                } else if (focus.#peek().type === TokeTypes.positive ||
                    focus.#peek().type === TokeTypes.value ||
                    focus.#peek().type === TokeTypes.number ||
                    focus.#peek().type === TokeTypes.true ||
                    focus.#peek().type === TokeTypes.false ||
                    focus.#peek().type === TokeTypes.key) {

                    if (focus.#peek().type === TokeTypes.positive && (
                        focus.#peek(1).type === TokeTypes.value ||
                        focus.#peek(1).type === TokeTypes.number ||
                        focus.#peek(1).type === TokeTypes.true ||
                        focus.#peek(1).type === TokeTypes.false ||
                        focus.#peek(1).type === TokeTypes.key)) {

                        focus.#delete(); // eat the positive notation
                        if (focus.#peek().type === TokeTypes.key) {
                            product.content.push({
                                type: TokenTypes.key,
                                subType: TokenSubTypes.positiveKey,
                                content: focus.#delete().content // keep the value
                            });
                        } else {
                            product.content.push({
                                type: TokenTypes.positiveValue,
                                subType: TokenSubTypes.none,
                                content: focus.#delete().content // keep the value
                            });
                        }
                    } else if (focus.#peek().type === TokeTypes.positive && (
                        focus.#peek(1).type !== TokeTypes.value &&
                        focus.#peek(1).type !== TokeTypes.number &&
                        focus.#peek(1).type !== TokeTypes.true &&
                        focus.#peek(1).type !== TokeTypes.false &&
                        focus.#peek(1).type !== TokeTypes.key)) {

                        product.content.push({
                            type: TokenTypes.exists,
                            subType: TokenSubTypes.none,
                            content: focus.#delete().content
                        });
                    } else {
                        if (focus.#peek().type === TokeTypes.key) {
                            product.content.push({
                                type: TokenTypes.key,
                                subType: TokenSubTypes.positiveKey,
                                content: focus.#delete().content // keep the value
                            });
                        } else {
                            product.content.push({
                                type: TokenTypes.positiveValue,
                                subType: TokenSubTypes.none,
                                content: focus.#delete().content // keep the value
                            });
                        }
                    }
                } else if (focus.#peek().type === TokeTypes.regex) {
                    product.content.push({
                        type: TokenTypes.regex,
                        subType: TokenSubTypes.none,
                        content: focus.#delete().content
                    });
                } else {
                    focus.#log.push({
                        index: focus.#getIndex(origIndex),
                        reason: `Condition expected, but got '${focus.#peek().content}' instead.`
                    });
                    break;
                }
            }
        } else {
            focus.#log.push({
                index: focus.#getIndex(origIndex),
                reason: `Condition expected, but got '${focus.#peek().content}' instead.`
            });
        }

        if (focus.error() === false) {
            outcome = product;

            if (inline === false) {
                focus.#post(outcome);
            }
        }

        return outcome;
    }

    #handleOperator(inline = false, that) {
        const focus = (() => {
            return !!this ? this : that
        })();
        const origIndex = focus.#index;

        // get the operator and then give it to the next operation so it can be added at the root as the precedingOperator
        const op = focus.#peek().type === TokeTypes.logicalAnd ?
            TokenTypes.and :
            (focus.#peek().type === TokeTypes.logicalOr ? TokenTypes.or : undefined);
        let operator = {
            type: op,
            subType: TokenSubTypes.none,
            content: op
        };

        // handleOperator does not return operator tokens, 
        // this method instead returns the type of token that follows the operator
        let outcome = undefined;
        if (op !== undefined) {
            focus.#delete();

            if (focus.#peek().type === TokeTypes.openParenthesis) {
                outcome = focus.#handleParenthetical(operator, inline);
            } else if (focus.#peek(1).type === TokeTypes.divider) {
                outcome = focus.#handleCondition(operator, inline);
            } else if (focus.#peek().family === TokeFamilies.expression) {
                outcome = focus.#handleNestedCondition(operator, inline);
            } else if (focus.#peek().family === TokeFamilies.key) {
                outcome = focus.#handlePathRun(operator, inline);
            } else {
                focus.#log.push({
                    index: focus.#getIndex(origIndex),
                    reason: `Parenthetical, Condition, Nested Condition, or Condition Path expected, but found '${focus.#peek().content}' instead.`
                });
            }
        } else {
            focus.#log.push({
                index: focus.#getIndex(origIndex),
                reason: `Toke is not a logical operator.  Expected '&&' or '||', but got '${focus.#peek().content}' instead.`
            });
        }

        return outcome;
    }

    #handleFunction(precedingOperator, inline = false) {
        const focus = (() => {
            return !!this ? this : that
        })();
        // a path run is anything from a key to the key preceding a divider or an operator
        let product = {
            type: TokenTypes.key,
            subType: TokenSubTypes.function,
            content: [],
            parameters: undefined,
        }
        if (!!precedingOperator) product.precedingOperator = precedingOperator;

        if (focus.#peek().type === TokeTypes.key) {
            // this is the property where the function lives
            product.content.push(focus.#delete());

            if (focus.#peek().type === TokeTypes.function) {
                // next should be a semi colon (the function declaration)
                product.content.push(focus.#delete());

                // lastly, there should be either a positive value (a reference term for the function parameter dictionary provided),
                // a separator, indicating this function has no parameters,
                // or a divider, indicating this function is the opening key to a full condition
                if (focus.#peek().type === TokeTypes.value) {
                    // if we have a positive value, we have to ensure that the parameters were provided
                    if (focus.#peek().content in focus.#parameterDictionary) {
                        // we have it, store that for use by the interpreter static class
                        product.parameters = [...focus.#parameterDictionary[focus.#delete().content]];
                    } else {
                        focus.#log.push({
                            index: focus.#getIndex(focus.#index), // if we got nothing then the index didn't move
                            reason: `Function parameter set key not found in parameter dictionary.`
                        });
                    }
                } else if ((focus.#peek().type === TokeTypes.separator) || (focus.#peek().type === TokeTypes.divider)) {
                    // this is completion.
                } else {
                    focus.#log.push({
                        index: focus.#getIndex(focus.#index), // if we got nothing then the index didn't move
                        reason: `Function parameter key or separator expected, but got '${focus.#peek().content}'.`
                    });
                }
            } else {
                focus.#log.push({
                    index: focus.#getIndex(focus.#index), // if we got nothing then the index didn't move
                    reason: `Function declarator (;) expected, but got '${focus.#peek().content}'.`
                });
            }
        } else {
            focus.#log.push({
                index: focus.#getIndex(focus.#index), // if we got nothing then the index didn't move
                reason: `Function key expected, but got '${focus.#peek().content}'.`
            });
        }

        if (inline === false) {
            focus.#post(product);
        }
        return product;
    }

    #handlePathRun(precedingOperator, inline = false, that) {
        const focus = (() => {
            return !!this ? this : that
        })();
        // a path run is anything from a key to the key preceding a divider or an operator
        let product = {
            type: TokenTypes.pathRun,
            subType: TokenSubTypes.none,
            content: []
        }
        if (!!precedingOperator) product.precedingOperator = precedingOperator;

        while (
            focus.#end() === false &&
            focus.#peek().type !== TokeTypes.divider &&
            focus.#peek().family !== TokeFamilies.operator &&
            focus.#peek().type !== TokeTypes.openParenthesis &&
            focus.#peek().type !== TokeTypes.closeParenthesis &&
            (focus.#peek(1).type !== TokeTypes.divider || product.content.length === 0)) {
            if (focus.#peek().family === TokeFamilies.key) {
                if (focus.#peek(1).type === TokeTypes.function) {
                    const func = focus.#handleFunction(undefined, true);

                    // functions, like any key, can be used to open full conditions
                    if (focus.#peek().type === TokeTypes.divider) {                 
                        // if a full condition follows then 
                        //      put the fully realized function back, 
                        //      completely replacing the tokens that made it up the 
                        //      conclude
                        
                        // a function is made up of two or three tokes.
                        //      a key defining the name of the function in the container
                        //      a semi colon declaring the function definition
                        //      and optionally, a parameter reference term (the name of the item in the provided dictionary)
                        // using the above knowledge, delete the original tokens based on the function definition
                        const offsetAmount = (!!func.parameters ? 3 : 2);
                        focus.#work.splice(this.#index - offsetAmount, offsetAmount);
                        focus.#work.splice(focus.#index - offsetAmount, 0, func);

                        // once the surgery is complete, set the index to point to the item just behind the function
                        focus.#index = focus.#index - offsetAmount;
                        break;
                    } else {
                        // just a key
                        product.content.push(func);
                    }
                } else {
                    let key = focus.#delete();
                    key.subType = TokenSubTypes.positiveKey;

                    product.content.push(key);
                }
            } else if (focus.#peek().type === TokeTypes.separator) {
                // conditions are not part of path runs, so only add the separator if a condition does not follow
                if (focus.#peek(2).type !== TokeTypes.divider || product.content.length === 0) {
                    let separator = focus.#delete();
                    separator.subType = TokenSubTypes.none;

                    product.content.push(separator);
                } else {
                    // if a condition does follow, the path run terminates and does not include the condition
                    break;
                }
            } else {
                // if the last toke was a separator, this error message is skipped
                if (product.content[product.content.length - 1].type !== TokeTypes.separator) {
                    focus.#log.push({
                        index: focus.#getIndex(focus.#index), // if we got nothing then the index didn't move
                        reason: `Path run expected key, parenthetical, or seperator, but got '${focus.#peek().content}'.`
                    });
                }

                break;
            }
        }

        if (product.content.length === 0) {
            // if the product has no content and the last token is a function key then skip this message
            if (focus.#peek().subType === TokenSubTypes.function) {
                return;
            }
            focus.#log.push({
                index: focus.#getIndex(focus.#index), // if we got nothing then the index didn't move
                reason: `Path run expected key, parenthetical, or seperator, but got '${focus.#peek().content}'.`
            });

            return;
        }

        // if the last token is a separator, relinquish it to the queue so it can be dealt with properly
        if (product.content[product.content.length - 1].type === TokeTypes.separator) {
            product.content.splice(product.content.length - 1, 1);
            focus.#index -= 1;
        }

        if (inline === false) {
            focus.#post(product);
        }
        return product;
    }

    #handleCopyOver() {
        // tokens don't have a family because it isn't needed
        let toke = this.#delete();
        delete toke.family;

        this.#post(toke);
    }
}