import { jobjesLog } from "./jobjesLog.mjs";
import { JobjeSTokeGenerator, TokeFamilies, TokeTypes } from "./jobjesTokeGenerator.mjs";

/*
Copyright (C) Zain T. Al-Ahmary

MIT license.  I am not responsible for how you use or what happens as a result of what you use this for.
*/

/**
 * Represents every possible type of tokens
 */
export const TokenTypes = {
    separator: 'separator',
    divider: 'divider',
    filter: 'filter',
    regex: 'regex', // a regular expression
    key: 'key',  // a piece of text meant to represent a property name
    subquery: 'subquery',

    exists: '!!', // !!
    notexists: '!', // !
    any: '*', // *
    anyAtAll: '**', // **
    sequence: ',',
    mergeSequence: '+',
    objectize: '>',
    enumerate: '<',
    array: '@',
    external: '$',
    parameterItem: 'parameter',

    conversion: 'conversion',
    convertInclude: 'convert: include',
    convertBlock: 'convert: block',
    convertIfNotFound: 'convert: if not found',
    convertIfFound: 'convert: if found',

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
    normalDivider: 'normal-divider',
    filterDivider: 'filter-divider',
    nestedCondition: "nestedCondition",  // of the form:  <expectation>  (no key association or divider)
    fullCondition: "fullCondition", // of the form  <key>:<value expection>
    positiveKey: "posKey", // preceded by nothing or the exists operator (!!)
    negativeKey: "negKey", // preceded by the not exists operataor (!)
    function: "function", // a function call (of the form: <key>;<parameter bundle name>)
    sequencing: 'subquery operator', // used to connect subqueries
    conversion: 'conversion',
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
    #mostRecentlyAddedToken;
    #currentQuery;

    /**
     * Create a tokenizer instance
     * @param {object} paramDictionary A dictionary of key->parameter array sets for use with any function calls
     */
    constructor(paramDictionary, logStorage = []) {
        this.#parameterDictionary = paramDictionary;
        this.#log = new jobjesLog(logStorage);
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
        return this.#log.count() > 0;
    }

    /**
     * Adds an error to the log object
     * @param {object} error The error object to add to the log
     */
    #logError(error) {
        this.#log.logError(error.reason, undefined, error.index, undefined);
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
            this.#logError({ index: -1, reason: 'Toker generated errors.  See previous.' });
        } else {
            this.#tokens = [];
            this.#work = toker.tokens();
            this.#index = 0;

            // we already have tokes, so we're going to loop through and assemble full tokens for the main class to interpret
            // this will create arrangements that make solving easier, and should make the code simpler in the long run
            let subqueryOperator = undefined;
            while (this.#end() === false && this.error() === false) {
                this.#handleSubquery(subqueryOperator);

                if (this.error() === true) {
                    break;
                } else {
                    // if there is a conversion, it immediately follows the subquery, preceding any sequence operator present (merge or normal)
                    /* if (this.#peek().type === TokeTypes.beginConversion) {
                        const conversion = this.#handleConversion(true);

                        // the last added token will be the subquery this conversion belongs on
                        this.#tokens[this.#tokens.length - 1].conversion = conversion;
                    } */

                    if (this.#peek().type === TokeTypes.sequence) {
                        subqueryOperator = {
                            index: this.#delete().index,
                            type: TokenTypes.sequence,
                            subType: TokenSubTypes.sequencing,
                            content: TokenTypes.sequence
                        };
                    } else if (this.#peek().type === TokeTypes.mergeSequence) {
                        subqueryOperator = {
                            index: this.#delete().index,
                            type: TokenTypes.mergeSequence,
                            subType: TokenSubTypes.sequencing,
                            content: TokenTypes.mergeSequence
                        };
                    } else {
                        if (this.#end() !== true) {
                            this.#logError({
                                index: this.#index,
                                reason: `Unexpected toke found.  '${this.#peek().content}'`
                            });
                        } else {
                            subqueryOperator = undefined;
                        }
                    }
                }
            }
        }

        return this.#tokens;
    }

    /**
     * Retrieves and removes the indicated tokes from the #work array
     * @param {Number} offset The number of tokes from the current index to start at
     * @param {Number} length The number of tokes to gather up to
     * @returns The resulting string
     */
    #pop(offset = 0, length = 1) {
        const result = this.#work.slice(this.#index + offset, this.#index + offset + length);
        this.#index += offset + length;
        return result.length === 1 ? result[0] : result;
    }

    /**
     * Retrieves (but doesn't remove) the indicated tokes from the #work array
     * @param {Number} offset The number of tokes from the current index to start at
     * @param {Number} length The number of tokes to gather up to
     * @returns The resulting string
     */
    #peek(offset = 0, length = 1) {
        const result = this.#work.slice(this.#index + offset, this.#index + offset + length);
        return result.length === 1 ? result[0] : result;
    }

    /**
     * Increments the index by the given number of tokes.  Will not go beyond the end of the array
     * @param {Number} count 
     */
    #delete(count = 1) {
        const result = this.#work.slice(this.#index, this.#index + count);
        this.#index = this.#index + count;
        return result.length === 1 ? result[0] : result;
    }

    /**
     * Adds the token to the internal list
     * @param {object} token the toke to add 
     */
    #post(token) {
        this.#tokens.push(token);

        this.#onAddTokenAnywhere(token);
    }

    /**
     * Adds a token to an array in a tracked manner
     * @param {object} parentToken The containing token
     * @param {Array} contentArray The array to add the token to
     * @param {object} token The token to add
     */
    #contentPush(parentToken, contentArray, token) {
        contentArray.push(token);

        token.parent = parentToken;
        // track the addition
        this.#onAddTokenAnywhere(token);
    }

    /**
     * Sets the immediateKey property on the previously added token
     * @param {object} token The nextly added token
     */
    #onAddTokenAnywhere(token) {
        // only track non-container tokens (tokens that don't indicate the purpose of their contained tokens)
        // unless they are in a conversion
        if (Array.isArray(token.content) === false && token.type !== TokenTypes.separator && token?.parent?.type !== TokenTypes.conversion) {
            if (!!this.#mostRecentlyAddedToken) {
                this.#mostRecentlyAddedToken.next = token;
            }
            this.#mostRecentlyAddedToken = token;
        } else if (token?.parent?.type === TokenTypes.conversion) {
            // in the case of conversions, the tokens in it do not come to bear on execution logic
            // this is because they are executed in a sand box by the conversion operation
            if (!!this.#mostRecentlyAddedToken) {
                this.#mostRecentlyAddedToken.next = token;
            }
            this.#mostRecentlyAddedToken = token;
        }

        if (!!this.#currentQuery && this.#currentQuery.first === undefined) {
            if (!!this.#mostRecentlyAddedToken) {
                this.#currentQuery.first = this.#mostRecentlyAddedToken;
            }
        }
    }

    /**
     * Returns all tokes up to (non-inclusive) the first instance of given type, or an empty array if the toke is not found
     * @param {string} tokeType The type of the toke to look for the first occurance of
     * @param {Number} offset Where to start from, relative to the current index     * 
     * @returns {Array} all tokes up to (non-inclusive) the first instance of given type, or an empty array if the toke is not found
     */
    #upToFirstType(tokeType, offset = 0) {
        let result = [];
        let found = false;

        for (let i = this.#index + offset; i < this.#work.length; i++) {
            if (this.#work[i].type === tokeType) {
                found = true;
                break;
            } else {
                result.push(this.#work[i]);
            }
        }

        if (found === true) {
            return result;
        } else {
            return [];
        }
    }

    /**
     * Returns all tokes up to (non-inclusive) the first instance of given family, or an empty array if the toke is not found
     * @param {string} tokeFamily The family of the toke to look for the first occurance of
     * @param {Number} offset Where to start from, relative to the current index     * 
     * @returns {Array} all tokes up to (non-inclusive) the first instance of given family, or an empty array if the toke is not found
     */
    #upToFirstFamily(tokeFamily, offset = 0) {
        let result = [];
        let found = false;

        for (let i = this.#index + offset; i < this.#work.length; i++) {
            if (this.#work[i].family === tokeFamily) {
                found = true;
                break;
            } else {
                result.push(this.#work[i]);
            }
        }

        if (found === true) {
            return result;
        } else {
            return [];
        }
    }

    /**
     * Returns a boolean value indicating if the index + the offset is pointing to the end of the work array
     * @param {number} [offset=0] The offset from the current index
     * @returns If at the end, true, false otherwise.
     */
    #end(offset = 0) {
        return (this.#index + offset) >= this.#work.length;
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

        const originPoint = this.#peek().index;

        const result = !!parameters && Array.isArray(parameters) ? method(...parameters, this) : method();
        if (this.error()) {
            this.#logError({
                index: originPoint,
                reason: errorMessage
            });
        } else {
            set.push(result);

            /* this.#onAddTokenAnywhere(result); */
        }
    }

    #handleParenthetical(precedingOperator, inline = false, that) {
        const focus = (() => {
            return !!this ? this : that
        })();
        const origIndex = focus.#peek().index;

        let product = {
            index: focus.#peek().index,
            type: TokenTypes.parenthetical,
            subType: TokenSubTypes.none,
            content: []
        }
        if (!!precedingOperator) product.precedingOperator = precedingOperator;

        let outcome = undefined;
        if (focus.#peek().type === TokeTypes.openParenthesis) {
            focus.#delete();

            while (focus.#end() === false && focus.#peek().type !== TokeTypes.closeParenthesis && focus.error() === false) {
                if (focus.#peek().type === TokeTypes.openParenthesis) {
                    focus.#addTo(
                        product.content,
                        focus.#handleParenthetical,
                        [undefined, true],
                        `Failed to extract nested parenthetical.`
                    );
                } else if (focus.#peek(1).type === TokeTypes.divider || focus.#peek(1).type === TokeTypes.filter) {
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

                    focus.#contentPush(product, product.content, toke);
                } else {
                    focus.#logError({
                        index: focus.#peek().index,
                        reason: `Unexpected toke '${focus.#peek().content}'.`
                    });
                    break;
                }
            }

            if (focus.#peek().type === TokeTypes.closeParenthesis) {
                focus.#delete();
            } else {
                focus.#logError({
                    index: origIndex,
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
            focus.#logError({
                index: origIndex,
                reason: `Expected '(', but got '${focus.#peek().content}' instead.`
            });
        }

        return outcome;
    }

    #handleSubquery(sequenceOperator, inline = false, hardstopFamily, hardstopType) {
        const focus = (() => {
            return !!this ? this : that
        })();

        let product = {
            index: focus.#peek().index,
            type: TokenTypes.subquery,
            subType: TokenSubTypes.none,
            content: [],
            sequencer: sequenceOperator,
            postOperation: [],
            first: undefined, // used to expediate execution in the case of a query starting with a key
        }
        this.#currentQuery = product;

        const handleSubQuery = () => {
            while (
                focus.#end() === false && focus.error() === false &&
                focus.#peek().type !== TokeTypes.endSubquery &&
                focus.#peek().type !== TokeTypes.sequence &&
                focus.#peek().type !== TokeTypes.mergeSequence &&
                focus.#peek().type !== TokeTypes.objectize &&
                focus.#peek().type !== TokeTypes.enumerate &&
                (focus.#peek().family !== hardstopFamily || hardstopFamily === undefined) &&
                (focus.#peek().type !== hardstopType || hardstopType === undefined)
            ) {

                if (focus.#peek().type === TokeTypes.openParenthesis) {
                    focus.#contentPush(product, product.content, focus.#handleParenthetical(undefined, true));
                } else if (focus.#peek(1).type === TokeTypes.divider || focus.#peek(1).type === TokeTypes.filter) {
                    focus.#contentPush(product, product.content, focus.#handleCondition(undefined, true));
                } else if (focus.#peek().family === TokeFamilies.expression) {
                    focus.#contentPush(product, product.content, focus.#handleNestedCondition(undefined, true));
                } else if (focus.#peek().family === TokeFamilies.key) {
                    focus.#contentPush(product, product.content, focus.#handlePathRun(undefined, true));
                } else if (focus.#peek().family === TokeFamilies.operator) {
                    focus.#contentPush(product, product.content, focus.#handleOperator(true));
                } else if (focus.#peek().type === TokeTypes.beginConversion) {
                    focus.#contentPush(product, product.content, focus.#handleConversion(true));
                } else if (focus.#peek().type === TokeTypes.external) {
                    focus.#contentPush(product, product.content, focus.#handleExternalFunction(true));
                } else {
                    focus.#contentPush(product, product.content, focus.#handleCopyOver(true));
                }
            }
        }

        if (focus.#peek().type === TokeTypes.startSubquery) {
            focus.#delete(); // the start
            handleSubQuery();

            if (focus.#peek().type === TokeTypes.endSubquery) {
                focus.#delete(); // the end
            } else {
                focus.#logError({
                    index: focus.#peek().index,
                    reason: `Subqueries that start with markers '[' must end with them ']'.  Instead, found '${focus.#peek().content}'`
                });
            }
        } else if (focus.#peek().type !== TokeTypes.startSubquery) {
            handleSubQuery();
        } else {
            focus.#logError({
                index: focus.#peek().index,
                reason: `Subqueries must start with markers '[' or nothing (i.e. technically, every query is a subquery that has no neighbor).  Instead, found '${focus.#peek().content}'`
            });
        }

        if (focus.error() === false) {
            while (focus.#peek().type === TokeTypes.objectize || focus.#peek().type === TokeTypes.enumerate) {
                if (focus.#peek().type === TokeTypes.objectize) {
                    focus.#delete();
                    product.postOperation.push({ objectize: true });
                } else if (focus.#peek().type === TokeTypes.enumerate) {
                    focus.#delete();
                    product.postOperation.push({ enumerate: true });
                }
            }

            if (product.postOperation.length > 1) {
                focus.#logError({
                    index: focus.#peek().index,
                    reason: `Subqueries can have only one post operation.  This one has multiples (${product.postOperation.join(',')})`
                });
            } else {
                if (product.postOperation.length === 1) {
                    product.postOperation = product.postOperation[0];
                } else {
                    product.postOperation = { objectize: false, enumerate: false };
                }
            }
        }

        // at the end of every subquery, clear the trackers
        this.#mostRecentlyAddedToken = undefined;
        this.#currentQuery = undefined;

        if (inline === false) {
            focus.#post(product);
        }
        return product;
    }

    #handleCondition(precedingOperator, inline = false, that) {
        const focus = (() => {
            return !!this ? this : that
        })();
        const origIndex = focus.#peek().index;

        let product = {
            index: focus.#peek().index,
            type: TokenTypes.condition,
            subType: TokenSubTypes.fullCondition,
            content: []
        }
        if (!!precedingOperator) product.precedingOperator = precedingOperator;

        let outcome = undefined;
        if (focus.#peek().type === TokeTypes.key && (focus.#peek(1).type === TokeTypes.divider || focus.#peek(1).type === TokeTypes.filter)) {
            focus.#contentPush(product, product.content, focus.#delete());

            // to support filters, dividers and filters need metadata to help the interpreter handle them properly
            if (focus.#peek().type === TokeTypes.divider) {
                let div = {
                    ...focus.#delete(),
                    subType: TokenSubTypes.normalDivider
                };
                focus.#contentPush(product, product.content, div);
            } else if (focus.#peek().type === TokeTypes.filter) {
                let div = {
                    ...focus.#delete(),
                    subType: TokenSubTypes.filterDivider
                };
                focus.#contentPush(product, product.content, div);
            }

            while (
                focus.#end() === false &&
                focus.#peek().family === TokeFamilies.expression &&
                focus.#peek().type !== TokeTypes.closeParenthesis &&
                focus.error() === false) {
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
            focus.#logError({
                index: origIndex,
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
        const origIndex = focus.#peek().index;

        let product = {
            index: focus.#peek().index,
            type: TokenTypes.condition,
            subType: TokenSubTypes.nestedCondition,
            content: []
        }
        if (!!precedingOperator) product.precedingOperator = precedingOperator;

        let outcome = undefined;
        if (focus.#peek().family === TokeFamilies.expression) {
            while (focus.#end() === false && focus.error() === false && focus.#peek().family === TokeFamilies.expression && focus.#peek().type !== TokeTypes.closeParenthesis) {
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
                            focus.#contentPush(product, product.content, {
                                index: focus.#peek().index,
                                type: TokenTypes.key,
                                subType: TokenSubTypes.negativeKey,
                                content: focus.#delete().content // keep the value
                            });
                        } else {
                            focus.#contentPush(product, product.content, {
                                index: focus.#peek().index,
                                type: TokenTypes.negativeValue,
                                subType: TokenSubTypes.none,
                                content: focus.#delete().content // keep the value
                            });
                        }
                    } else {
                        focus.#contentPush(product, product.content, {
                            index: focus.#peek().index,
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
                            focus.#contentPush(product, product.content, {
                                index: focus.#peek().index,
                                type: TokenTypes.key,
                                subType: TokenSubTypes.positiveKey,
                                content: focus.#delete().content // keep the value
                            });
                        } else {
                            focus.#contentPush(product, product.content, {
                                index: focus.#peek().index,
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

                        focus.#contentPush(product, product.content, {
                            index: focus.#peek().index,
                            type: TokenTypes.exists,
                            subType: TokenSubTypes.none,
                            content: focus.#delete().content
                        });
                    } else {
                        if (focus.#peek().type === TokeTypes.key) {
                            focus.#contentPush(product, product.content, {
                                index: focus.#peek().index,
                                type: TokenTypes.key,
                                subType: TokenSubTypes.positiveKey,
                                content: focus.#delete().content // keep the value
                            });
                        } else {
                            focus.#contentPush(product, product.content, {
                                index: focus.#peek().index,
                                type: TokenTypes.positiveValue,
                                subType: TokenSubTypes.none,
                                content: focus.#delete().content // keep the value
                            });
                        }
                    }
                } else if (focus.#peek().type === TokeTypes.regex) {
                    focus.#contentPush(product, product.content, {
                        index: focus.#peek().index,
                        type: TokenTypes.regex,
                        subType: TokenSubTypes.none,
                        content: focus.#delete().content
                    });
                } else {
                    focus.#logError({
                        index: origIndex,
                        reason: `Condition expected, but got '${focus.#peek().content}' instead.`
                    });
                    break;
                }
            }
        } else {
            focus.#logError({
                index: origIndex,
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
        const origIndex = focus.#peek().index;

        // get the operator and then give it to the next operation so it can be added at the root as the precedingOperator
        const op = focus.#peek().type === TokeTypes.logicalAnd ?
            TokenTypes.and :
            (focus.#peek().type === TokeTypes.logicalOr ? TokenTypes.or : undefined);
        let operator = {
            index: focus.#peek().index,
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
                focus.#logError({
                    index: origIndex,
                    reason: `Parenthetical, Condition, Nested Condition, or Condition Path expected, but found '${focus.#peek().content}' instead.`
                });
            }
        } else {
            focus.#logError({
                index: origIndex,
                reason: `Toke is not a logical operator.  Expected '&&' or '||', but got '${focus.#peek().content}' instead.`
            });
        }

        return outcome;
    }

    #handleConversion(inline = false, that) {
        const focus = (() => {
            return !!this ? this : that
        })();

        const origIndex = focus.#peek().index;

        let product = {
            index: focus.#peek().index,
            type: TokenTypes.conversion,
            subType: TokenSubTypes.conversion,
            content: [],
            inclusive: focus.#peek(1).type === TokeTypes.inclusiveConversion
        }

        if (focus.#peek().type === TokeTypes.beginConversion) {
            focus.#delete();
            if (focus.#peek().type === TokeTypes.inclusiveConversion) focus.#delete();

            // conversion statements follow this format:
            // subquery>>pathrun (source operator destination)
            // conversions are comma separated lists of these statements, thus we can loop until we find the ending curly bracket.

            // Note that you cannot nest conversions 
            // (there is no real reason to support this, and it would make things more complex for little benefit, since you'd convert something so you could convert it)
            while (focus.#end() === false && focus.#peek().type !== TokeTypes.endConversion && focus.error() === false) {
                const canSubquery = focus.#upToFirstFamily(TokeFamilies.conversion).length > 0;
                if (canSubquery === true) {
                    // an anchored source queries from the beginning, as if running fresh, instead of relative to the current context
                    // to anchor a conversion source, put a separator at the beginning '.'
                    let anchored = false;
                    if (focus.#peek().type === TokeTypes.separator) {
                        focus.#delete();
                        anchored = true;
                    }

                    // these are the types of conversion operators
                    const convertOperator = {
                        include: 1,
                        block: 2,
                        ifFound: 3,
                        ifNotFound: 4
                    };

                    // this is used for ease of maintenance
                    const conversionOperatorListing = "'+>', '->', '!>', and '!!>'";

                    // find what kind of convert operator is in use
                    let convertType = undefined;
                    for (let lookAheadIndex = 0; focus.#end(lookAheadIndex) === false; lookAheadIndex++) {
                        if (focus.#peek(lookAheadIndex).type === TokeTypes.convertInclude) {
                            convertType = convertOperator.include;
                            break;
                        } else if (focus.#peek(lookAheadIndex).type === TokeTypes.convertBlock) {
                            convertType = convertOperator.block;
                            break;
                        } else if (focus.#peek(lookAheadIndex).type === TokeTypes.convertIfFound) {
                            convertType = convertOperator.ifFound;
                            break;
                        } else if (focus.#peek(lookAheadIndex).type === TokeTypes.convertIfNotFound) {
                            convertType = convertOperator.ifNotFound;
                            break;
                        }
                    }

                    // this divergence is required because 
                    //      includes require a source (query) and a destination (pathrun)
                    //      while blocks only require a source (pathrun)

                    // note: this code structure is clearer (hopefully) but does require some repetition
                    if (convertType === convertOperator.include) {
                        // includes follow this format: [query]+>[pathrun]
                        const source = focus.#handleSubquery(undefined, true, TokeFamilies.conversion);
                        let isRequired = true;

                        // track the inclusion operator's starting point for indexing
                        let inclusionOpIndex = -1;

                        // the presence of a negative '-' indicates that this operation is optional, 
                        // meaning it does not have to succeed
                        if (focus.#peek().type === TokeTypes.convertNotRequired) {
                            inclusionOpIndex = focus.#delete().index;
                            isRequired = false;
                        }

                        // after the source, in this case, we expect an inclusion operator
                        if (focus.#peek().type === TokeTypes.convertInclude) {
                            // if its not required, the '-' marks the start, otherwise, it starts here
                            if (inclusionOpIndex === -1) {
                                inclusionOpIndex = focus.#delete().index;
                            } else {
                                focus.#delete();
                            }

                            // next we expect a destination, which should be a path run (since we're going to create it in the target)
                            const destination = focus.#handlePathRun(undefined, true);

                            if (focus.#log.count() === 0) {
                                focus.#contentPush(product, product.content, {
                                    index: inclusionOpIndex,
                                    required: isRequired,
                                    anchored: anchored,
                                    source: source,
                                    destination: destination,
                                    operation: TokenTypes.convertInclude
                                });
                            }
                        } else {
                            focus.#logError({
                                index: origIndex,
                                reason: `Conversion operator ${conversionOperatorListing} expected, but got '${focus.#peek().content}' instead.`
                            });
                        }
                    } else if (convertType === convertOperator.block) {
                        // blocks follow this format: [pathrun]->
                        const source = this.#handlePathRun(undefined, true);
                        let isRequired = true;

                        // track the block operator's starting point for indexing
                        let blockOpIndex = -1;

                        // the presence of a negative '-' indicates that this operation is optional, 
                        // meaning it does not have to succeed
                        if (focus.#peek().type === TokeTypes.convertNotRequired) {
                            blockOpIndex = focus.#delete().index;
                            isRequired = false;
                        }

                        // after the source, in this case, we expect an exclusion operator
                        if (focus.#peek().type === TokeTypes.convertBlock) {
                            // if its not required, the '-' marks the start, otherwise, it starts here
                            if (blockOpIndex === -1) {
                                blockOpIndex = focus.#delete().index;
                            } else {
                                focus.#delete();
                            }

                            // block does not have a destination, only a target source
                            focus.#contentPush(product, product.content, {
                                index: blockOpIndex,
                                required: isRequired,
                                source: source,
                                operation: TokenTypes.convertBlock
                            });
                        } else {
                            focus.#logError({
                                index: origIndex,
                                reason: `Conversion operator ${conversionOperatorListing} expected, but got '${focus.#peek().content}' instead.`
                            });
                        }
                    } else if (convertType === convertOperator.ifFound) {
                        // "if found"s follow this format: [query]!!>[query] or [value],[pathrun]
                        // the above reads as 
                        //      "if (the inquisition query) exists then take (value query/value) and put it here (destination pathrun)"

                        const inquisition = focus.#handleSubquery(undefined, true, TokeFamilies.conversion);
                        let isRequired = true;

                        // track the 'if found' operator's starting point for indexing
                        let ifFoundIndex = -1;

                        // the presence of a negative '-' indicates that this operation is optional, 
                        // meaning it does not have to succeed
                        if (focus.#peek().type === TokeTypes.convertNotRequired) {
                            ifFoundIndex = focus.#delete().index;
                            isRequired = false;
                        }

                        // after the inquisition, in this case, we expect an "if found" operator
                        if (focus.#peek().type === TokeTypes.convertIfFound) {
                            // if its not required, the '-' marks the start, otherwise, it starts here
                            if (ifFoundIndex === -1) {
                                ifFoundIndex = focus.#delete().index;
                            } else {
                                focus.#delete();
                            }

                            // next we expect the value item
                            let value = undefined;
                            if (focus.#peek().type === TokeTypes.value) {
                                // it's either a value
                                value = focus.#delete();
                            } else {
                                // or an entire query
                                value = focus.#handleSubquery(undefined, true);
                            }

                            // next should be a comma
                            if (focus.#peek().type === TokeTypes.sequence) {
                                focus.#delete();

                                // next should be a pathrun
                                const destination = focus.#handlePathRun(undefined, true);

                                if (focus.#log.count() === 0) {
                                    focus.#contentPush(product, product.content, {
                                        index: ifFoundIndex,
                                        required: isRequired,
                                        anchored: anchored,
                                        inquisition: inquisition,
                                        value: value,
                                        destination: destination,
                                        operation: TokenTypes.convertIfFound
                                    });
                                }
                            } else {
                                focus.#logError({
                                    index: origIndex,
                                    reason: `Conversion operator ${conversionOperatorListing} expected, but got '${focus.#peek().content}' instead.`
                                });
                            }
                        } else {
                            focus.#logError({
                                index: origIndex,
                                reason: `Conversion operator ${conversionOperatorListing} expected, but got '${focus.#peek().content}' instead.`
                            });
                        }
                    } else if (convertType === convertOperator.ifNotFound) {
                        // "if not found"s follow this format: [query]!>[query] or [value],[pathrun]
                        // the above reads as 
                        //      "if (the inquisition query) does not exist then take (value query/value) and put it here (destination pathrun)"

                        const inquisition = focus.#handleSubquery(undefined, true, TokeFamilies.conversion);
                        let isRequired = true;

                        // track the 'if not found' operator's starting point for indexing
                        let ifNotFoundIndex = -1;

                        // the presence of a negative '-' indicates that this operation is optional, 
                        // meaning it does not have to succeed
                        if (focus.#peek().type === TokeTypes.convertNotRequired) {
                            ifNotFoundIndex = focus.#delete().index;
                            isRequired = false;
                        }

                        // after the inquisition, in this case, we expect an "if not found" operator
                        if (focus.#peek().type === TokeTypes.convertIfNotFound) {
                            // if its not required, the '-' marks the start, otherwise, it starts here
                            if (ifNotFoundIndex === -1) {
                                ifNotFoundIndex = focus.#delete().index;
                            } else {
                                focus.#delete();
                            }

                            // next we expect the value item
                            let value = undefined;
                            if (focus.#peek().type === TokeTypes.value) {
                                // it's either a value
                                value = focus.#delete();
                            } else {
                                // or an entire query
                                value = focus.#handleSubquery(undefined, true);
                            }

                            // next should be a comma
                            if (focus.#peek().type === TokeTypes.sequence) {
                                focus.#delete();

                                // next should be a pathrun
                                const destination = focus.#handlePathRun(undefined, true);

                                if (focus.#log.count() === 0) {
                                    focus.#contentPush(product, product.content, {
                                        index: ifNotFoundIndex,
                                        required: isRequired,
                                        anchored: anchored,
                                        inquisition: inquisition,
                                        value: value,
                                        destination: destination,
                                        operation: TokenTypes.convertIfNotFound
                                    });
                                }
                            } else {
                                focus.#logError({
                                    index: origIndex,
                                    reason: `Conversion operator ${conversionOperatorListing} expected, but got '${focus.#peek().content}' instead.`
                                });
                            }
                        } else {
                            focus.#logError({
                                index: origIndex,
                                reason: `Conversion operator ${conversionOperatorListing} expected, but got '${focus.#peek().content}' instead.`
                            });
                        }
                    } else {
                        focus.#logError({
                            index: origIndex,
                            reason: `Could not locate conversion operator.  Valid operators are ${conversionOperatorListing}.`
                        });
                    }

                    if (focus.error() === false) {
                        // check if we have a comma (sequence operator)
                        if (focus.#peek().type === TokeTypes.sequence) {
                            // if there is then eat it and keep going
                            focus.#delete();
                        }
                    }
                } else {
                    focus.#logError({
                        index: origIndex,
                        reason: `Source expected, but got '${focus.#peek().content}' instead.`
                    });
                    break;
                }
            }

            if (focus.#peek().type === TokeTypes.endConversion) {
                focus.#delete();
            }
        } else {
            focus.#logError({
                index: origIndex,
                reason: `Conversion statement expected.  Expected '{', but got '${focus.#peek().content}' instead.`
            });
        }

        if (focus.error() === false) {
            if (inline === false) {
                focus.#post(product);
            }
        }

        return product;
    }

    #handleFunction(precedingOperator, inline = false) {
        const focus = (() => {
            return !!this ? this : that
        })();
        // a path run is anything from a key to the key preceding a divider or an operator
        let product = {
            index: focus.#peek().index,
            type: TokenTypes.key,
            subType: TokenSubTypes.function,
            content: [],
            parameters: undefined,
        }
        if (!!precedingOperator) product.precedingOperator = precedingOperator;

        if (focus.#peek().type === TokeTypes.key) {
            // this is the property where the function lives
            focus.#contentPush(product, product.content, focus.#delete());

            if (focus.#peek().type === TokeTypes.function) {
                // next should be a semi colon (the function declaration)
                focus.#contentPush(product, product.content, focus.#delete());

                // lastly, there should be either a positive value (a reference term for the function parameter dictionary provided),
                // a separator, indicating this function has no parameters,
                // a divider, indicating this function is the opening key to a full condition,
                // or nothing, if this function is the end of the query
                if (focus.#peek().type === TokeTypes.value) {
                    // if we have a positive value, we have to ensure that the parameters were provided
                    if (focus.#peek().content in focus.#parameterDictionary) {
                        // we have it, store that for use by the interpreter static class
                        product.parameters = [...focus.#parameterDictionary[focus.#delete().content]];
                    } else {
                        focus.#logError({
                            index: focus.#peek().index, // if we got nothing then the index didn't move
                            reason: `Function parameter set key not found in parameter dictionary.`
                        });
                    }
                } else if ((focus.#peek().type === TokeTypes.separator) || (focus.#peek().type === TokeTypes.divider)) {
                    // this is completion.
                } else if (focus.#peek()?.length === 0) {
                    // because of how it works, when peek finds the end of the token set, it returns an empty array
                    // this means we are done, and is indentical to the above
                } else {
                    focus.#logError({
                        index: focus.#peek().index, // if we got nothing then the index didn't move
                        reason: `Function parameter key or separator expected, but got '${focus.#peek().content}'.`
                    });
                }
            } else {
                focus.#logError({
                    index: focus.#peek().index, // if we got nothing then the index didn't move
                    reason: `Function declarator (;) expected, but got '${focus.#peek().content}'.`
                });
            }
        } else {
            focus.#logError({
                index: focus.#peek().index, // if we got nothing then the index didn't move
                reason: `Function key expected, but got '${focus.#peek().content}'.`
            });
        }

        if (inline === false) {
            focus.#post(product);
        }
        return product;
    }

    #handleExternalFunction(inline = false, that) {
        const focus = (() => {
            return !!this ? this : that
        })();

        // an external function takes the form $<function name>(<default parameter>,[subquery, subquery, ...])
        let product = {
            index: focus.#peek().index,
            type: TokenTypes.external,
            subType: TokenSubTypes.none,
            parameters: [],
            name: undefined
        }

        if (focus.#peek().type === TokeTypes.external) {
            focus.#delete();

            // next should be a key
            // that key is the name of the function
            if (focus.#peek().type === TokeTypes.key) {
                product.name = focus.#delete().content;

                // now, get the parameters
                // the first two are assumed, these are the third onward, and should be supplied in a comma separated list
                if (focus.#peek().type === TokeTypes.openParenthesis) {
                    focus.#delete();

                    // parameters can be parameter tags or anything that resolves into a subquery
                    while (focus.#end() === false && focus.#peek().type !== TokeTypes.closeParenthesis && focus.error() === false) {
                        if (focus.#peek().type === TokeTypes.sequence) {
                            focus.#delete();
                        }

                        let term = undefined;

                        // if the statement is preceded by a '$' then it is treated as a parameter tag
                        if (focus.#peek().type === TokeTypes.external) {
                            focus.#delete();

                            if (focus.#peek().type === TokeTypes.value) {
                                // if we have a positive value, we have to ensure that the parameters were provided
                                if (focus.#peek().content in focus.#parameterDictionary) {
                                    // we have it, store that for use by the interpreter static class
                                    term = {
                                        type: TokenTypes.parameterItem,
                                        parameter: focus.#parameterDictionary[focus.#delete().content]
                                    };
                                } else {
                                    focus.#logError({
                                        index: focus.#peek().index, // if we got nothing then the index didn't move
                                        reason: `Function parameter set key not found in parameter dictionary.  Key: '${focus.#peek().content}'. (used with an external function)`
                                    });
                                }
                            } else {
                                focus.#logError({
                                    index: focus.#peek().index, // if we got nothing then the index didn't move
                                    reason: `Parameter tag value expected.`
                                });
                            }
                        } else {
                            // get the query up until the next closing parenthesis or comma.
                            term = focus.#handleSubquery(undefined, true, undefined, TokeTypes.closeParenthesis);
                        }

                        product.parameters.push(term);
                    }

                    if (focus.error() === false) {
                        // check for and eat the terminator
                        if (focus.#peek().type === TokeTypes.closeParenthesis) {
                            focus.#delete();
                        } else {
                            focus.#logError({
                                index: focus.#peek().index, // if we got nothing then the index didn't move
                                reason: `External function parameter closing ')' expected.  Got '${focus.#peek().content}'.`
                            });
                        }
                    }
                } else {
                    focus.#logError({
                        index: focus.#peek().index, // if we got nothing then the index didn't move
                        reason: `External function parameter opening '(' expected.  Got '${focus.#peek().content}'.`
                    });
                }
            } else {
                focus.#logError({
                    index: focus.#peek().index, // if we got nothing then the index didn't move
                    reason: `After the external opening, the function name is expected.  Got '${focus.#peek().content}'.`
                });
            }
        } else {
            focus.#logError({
                index: focus.#peek().index, // if we got nothing then the index didn't move
                reason: `External opening expect '$', but got '${focus.#peek().content}'.`
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
            index: focus.#peek().index,
            type: TokenTypes.pathRun,
            subType: TokenSubTypes.none,
            content: []
        }
        if (!!precedingOperator) product.precedingOperator = precedingOperator;

        while (
            focus.#end() === false && focus.error() === false &&
            focus.#peek().type !== TokeTypes.divider &&
            focus.#peek().family !== TokeFamilies.operator &&
            focus.#peek().type !== TokeTypes.openParenthesis &&
            focus.#peek().type !== TokeTypes.closeParenthesis &&
            focus.#peek().type !== TokeTypes.startSubquery &&
            focus.#peek().type !== TokeTypes.endSubquery &&
            focus.#peek().type !== TokeTypes.objectize &&
            focus.#peek().type !== TokeTypes.enumerate &&
            focus.#peek().family !== TokeFamilies.conversion &&
            ((focus.#peek(1).type !== TokeTypes.divider && focus.#peek(1).type !== TokeTypes.filter) || product.content.length === 0)) {
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
                        focus.#contentPush(product, product.content, func);
                    }
                } else if (focus.#peek().type === TokeTypes.array) {
                    focus.#contentPush(product, product.content, {
                        index: focus.#delete().index,
                        content: '@',
                        type: TokenTypes.array,
                        subType: TokenSubTypes.positiveKey
                    });
                } else {
                    let key = focus.#delete();
                    key.subType = TokenSubTypes.positiveKey;

                    focus.#contentPush(product, product.content, key);
                }
            } else if (focus.#peek().type === TokeTypes.separator) {
                // conditions are not part of path runs, so only add the separator if a condition does not follow
                if (focus.#peek(2).type !== TokeTypes.divider || product.content.length === 0) {
                    let separator = focus.#delete();
                    separator.subType = TokenSubTypes.none;

                    focus.#contentPush(product, product.content, separator);
                } else {
                    // if a condition does follow, the path run terminates and does not include the condition
                    break;
                }
            } else {
                // if the last toke was a separator or the current one is a sequence operator (, or +) or objectizer (>), this error message is skipped
                if (
                    product.content[product.content.length - 1].type !== TokeTypes.separator &&
                    focus.#peek().family !== TokeFamilies.sequencing &&
                    focus.#peek().type !== TokeTypes.objectize
                ) {

                    focus.#logError({
                        index: focus.#peek().index, // if we got nothing then the index didn't move
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
            focus.#logError({
                index: focus.#peek().index, // if we got nothing then the index didn't move
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

    #handleCopyOver(inline = false) {
        // tokens don't have a family because it isn't needed
        let toke = this.#delete();
        delete toke.family;

        if (inline === false) {
            this.#post(toke);
        }
        return toke;
    }
}