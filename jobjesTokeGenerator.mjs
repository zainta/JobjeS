import { jobjesLog } from "./jobjesLog.mjs";
import { duplicate, isRegex, isValidKey } from "./jobjesUtility.mjs";

/*
Copyright (C) Zain T. Al-Ahmary

MIT license.  I am not responsible for how you use or what happens as a result of what you use this for.
*/

// all characters considered whitespace.  these characters are ignored when not in a string.
const WhitespaceConstant = ' \t\n\r\v';

/**
 * Represents every possible type of tokes  (a toke is a primative token)
 */
export const TokeTypes = {
    openParenthesis: '(',
    closeParenthesis: ')',

    startSubquery: '[',
    endSubquery: ']',
    sequence: ',',
    mergeSequence: '+',
    objectize: '>',
    enumerate: '<',

    // conversions are self contained blocks that translate instances from one structure to another
    // in the future, they may support "reverse keying" to allow pulling values from other paths
    beginConversion: '{',
    endConversion: '}',
    inclusiveConversion: '+',  // just inside of the opening curly bracket '{', signals that everything is brought over
    convertInclude: '+>', // this value will be copied to the destination
    convertBlock: '->', // this value will not be copied (either inclusively or not)
    convertIfNotFound: '!>', // this value will be add if the query path returns nothing (query!>query / value,pathrun)
    convertIfFound: '!!>', // this value will be add if the query path returns a value (query!>query / value,pathrun)
    convertNotRequired: '-', // when preceding any convert operator, this makes it not a requirement

    number: '#',
    value: "value",
    true: 'true',
    false: 'false',
    positive: '!!',
    negative: '!',
    logicalAnd: '&&',
    logicalOr: '||',
    array: '@', // when used in the open, works like 'any', but only for arrays.  in a conversion, places subsequent items in an array
    external: '$',

    separator: 'separator',
    divider: 'divider',
    filter: 'filter', // a filter turns a full condition into a select, and is defined with # replacing the normal divider  (e.g. <key>#<value>)

    any: '*',
    anyAtAll: '**',
    function: 'function',

    key: 'key',
    regex: 'regex',
}

/**
 * The broad category the toke belongs to.  This is used by the Tokenizer.
 */
export const TokeFamilies = {
    expression: 'expression',
    operator: 'operator',
    metadata: 'meta',
    sequencing: 'subquery operator',
    key: 'key',
    conversion: 'conversion related',
    external: 'external',
}

/**
 * This class handles the generation of 'tokes'.  These are intermediary tokens consumed by the tokenizer for finalization.
 */
export class JobjeSTokeGenerator {
    #tokes;
    #work;
    #index;
    #separator;
    #divider;
    #log;

    /**
     * Create a tokizer instance
     * @param {any[]} [logStorage=[]] If provided, sets the array used for log storage
     */
    constructor(logStorage = []) {
        this.#log = new jobjesLog(logStorage);
    }

    /**
     * Returns the tokens generated during the last Tokenize call
     * @returns Returns the tokens from the last attempt
     */
    tokens() {
        return this.#tokes;
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
     * @returns {JobjeSTokeGenerator} A self reference
     */
    Tokize(query, divider, separator) {
        if (typeof query !== 'string' && query.length > 0) return undefined;
        if (typeof divider !== 'string' && divider.length > 0) return undefined;
        if (typeof separator !== 'string' && separator.length > 0) return undefined;
        if (separator === divider) return [];

        this.#separator = separator;
        this.#divider = divider;
        this.#tokes = [];
        this.#work = query;
        this.#index = 0;
        this.#log.reset();

        while (this.#end() === false && this.#log.count() === 0) {
            if (this.#peek(0, this.#separator.length) === this.#separator) {
                this.#getSeparator();
            } else if (this.#peek() === '!' && this.#peek(1) === '!' && this.#peek(2) === '>') {
                this.#getConvertIfFoundOperator();
            } else if (this.#peek() === '!' && this.#peek(1) === '>') {
                this.#getConvertIfNotFoundOperator();
            } else if (this.#peek() === '!') {
                this.#getAlignments(); // ! and !!
            } else if (this.#peek() === '*') {
                this.#getWildcards(); // * and **
            } else if (this.#peek() === '(' || this.#peek() === ')') {
                this.#getParenthesisBorder(); // ( and )
            } else if (this.#peek() === '[' || this.#peek() === ']') {
                this.#getSubqueryBorder(); // [ and ]
            } else if (this.#peek() === '{' || this.#peek() === '}') {
                this.#getConversionBorder(); // { and }
            } else if (this.#peek(0, this.#divider.length) === this.#divider) {
                this.#getDivider();
            } else if (this.#peek() === '/' && this.#peek(0, 2) !== '//') {
                this.#getRegex();
            } else if (this.#peek(0, 2) === '&&' || this.#peek(0, 2) === '||') {
                this.#getLogicals();
            } else if (this.#peek() === '#') {
                this.#getFilter();
            } else if (this.#peek() === ',') {
                this.#getSequenceMarker();
            } else if (this.#peek() === '+' && this.#peek(1) !== '>') {
                this.#getMergeSequenceMarker();
            } else if (this.#peek() === '>') {
                this.#getObjectizeMarker();
            } else if (this.#peek() === '<') {
                this.#getArraydicateMarker();
            } else if (this.#peek() === '+' && this.#peek(1) === '>') {
                this.#getConvertIncludeOperator();
            } else if (this.#peek() === '-' && this.#peek(1) === '>') {
                this.#getConvertBlockOperator();
            } else if (this.#peek(0, 4) === 'true' || this.#peek(0, 5) === 'false') {
                this.#getBooleans();
            } else if (Number.isInteger(this.#peek())) {
                this.#getNumbers();
            } else if (['"', "'"].includes(this.#peek())) {
                this.#getValue();
            } else if (this.#peek() === ';') {
                this.#getFunction();
            } else if (this.#peek() === '@') {
                this.#getArray();
            } else if (this.#peek() === '-') {
                this.#getConvertNotRequired();
            } else if (this.#peek() === '$') {
                this.#getExternal();
            } else if (this.#peek() === '&') {
                this.#getAnyKey();
            } else {
                this.#getKey();
            }
        }

        return this;
    }

    /**
     * Retrieves and removes the indicated characters from the #work array
     * @param {Number} offset The number of characters from the current index to start at
     * @param {Number} length The number of characters to gather up to
     * @returns The resulting string
     */
    #pop(offset = 0, length = 1) {
        const result = this.#work.substring(this.#index + offset, this.#index + offset + length);
        this.#index += offset + length;
        return result;
    }

    /**
     * Retrieves (but doesn't remove) the indicated characters from the #work array
     * @param {Number} offset The number of characters from the current index to start at
     * @param {Number} length The number of characters to gather up to
     * @returns The resulting string
     */
    #peek(offset = 0, length = 1) {
        const result = this.#work.substring(this.#index + offset, this.#index + offset + length);
        return result;
    }

    /**
     * Increments the index by the given number of characters.  Will not go beyond the end of the array
     * @param {Number} count 
     */
    #delete(count = 1) {
        let ret = this.#work.substring(this.#index, this.#index + count);
        this.#index = this.#index + count;
        return ret;
    }

    /**
     * Adds the toke to the internal toke list
     * @param {object} Toke the toke to add 
     */
    #post(toke) {
        this.#tokes.push(toke);
    }

    /**
     * Returns a boolean value indicating if the index is pointing to the end of the work array
     * @returns If at the end, true, false otherwise.
     */
    #end() {
        return this.#index >= this.#work.length;
    }

    #getSeparator() {
        let toke = {
            index: this.#index,
            type: TokeTypes.separator,
            family: TokeFamilies.metadata,
            content: this.#pop(0, this.#separator.length)
        }

        this.#post(toke);
    }

    #getDivider() {
        let toke = {
            index: this.#index,
            type: TokeTypes.divider,
            family: TokeFamilies.metadata,
            content: this.#pop(0, this.#divider.length)
        }

        this.#post(toke);
    }

    #getAlignments() {
        let outcome;
        const oldIndex = this.#index;
        let found = '';
        while (this.#peek() === '!') {
            found = `${found}${this.#delete()}`;
        }

        if (found.length > 0 && found.length < 3) {
            outcome = {
                index: oldIndex,
                type: found.length === 1 ? TokeTypes.negative : TokeTypes.positive,
                family: TokeFamilies.expression,
                content: found
            };
        } else {
            this.#logError({
                index: oldIndex,
                reason: "Excessive !'s found.  Either use 1 (does not exist) or 2 (exists).  Syntax error found.  Check query"
            });
        }

        if (this.#log.count() === 0) {
            this.#post(outcome);
        }
    }

    #getWildcards() {
        let outcome;
        const oldIndex = this.#index;
        let found = '';
        while (this.#peek() === '*') {
            found = `${found}${this.#delete()}`;
        }

        if (found.length > 0 && found.length < 3) {
            outcome = {
                index: oldIndex,
                type: found.length === 1 ? TokeTypes.any : TokeTypes.anyAtAll,
                family: TokeFamilies.key,
                content: found
            };
        } else {
            this.#logError({
                index: oldIndex,
                reason: "Excessive *'s found.  Either use 1 (any) or 2 (any at all).  Syntax error found.  Check query"
            });
        }

        if (this.#log.count() === 0) {
            this.#post(outcome);
        }
    }

    #getParenthesisBorder() {
        const oldIndex = this.#index;
        const content = this.#pop();

        let toke = {
            index: oldIndex,
            type: content === '(' ? TokeTypes.openParenthesis : TokeTypes.closeParenthesis,
            family: TokeFamilies.expression,
            content: content
        }

        this.#post(toke);
    }

    #getSubqueryBorder() {
        const oldIndex = this.#index;
        const content = this.#pop();

        let toke = {
            index: oldIndex,
            type: content === '[' ? TokeTypes.startSubquery : TokeTypes.endSubquery,
            family: TokeFamilies.key,
            content: content
        }

        this.#post(toke);
    }

    #getConversionBorder() {
        const oldIndex = this.#index;
        const content = this.#pop();

        let toke = {
            index: oldIndex,
            type: content === '{' ? TokeTypes.beginConversion : TokeTypes.endConversion,
            family: TokeFamilies.conversion,
            content: content
        }

        this.#post(toke);

        // check for the inclusive conversion operator
        if (this.#peek() === '+' && content === '{') {
            let opToke = {
                index: this.#index,
                type: TokeTypes.inclusiveConversion,
                family: TokeFamilies.conversion,
                content: this.#pop()
            }

            this.#post(opToke);
        }
    }

    #getRegex() {
        let outcome = undefined;

        // regular expressions start and end with unescaped delimiter characters (/)
        const oldIndex = this.#index;
        let found = '';

        // opening delimiter
        if (this.#peek() === '/') {
            this.#delete();
        } else {
            this.#logError({
                index: oldIndex,
                reason: "'/' expected"
            });
            return;
        }

        while (this.#peek() !== '/' && this.#end() === false) {
            if (this.#peek() === '\\' && this.#peek(1) === '/') {
                found = `${found}${this.#delete(2)}`;
            } else {
                found = `${found}${this.#delete()}`;
            }
        }

        // trailing delimiter
        if (this.#peek() === '/') {
            this.#delete();
        } else {
            this.#logError({
                index: oldIndex,
                reason: "'/' expected"
            });
            return;
        }

        if (isRegex(found)) {
            outcome = {
                index: oldIndex,
                type: TokeTypes.regex,
                family: TokeFamilies.expression,
                content: found
            };
        } else {
            this.#logError({
                index: oldIndex,
                reason: "Improper regular expression retrieved during query tokenization.  Syntax error detected.  Check query"
            });
        }

        if (this.#log.count() === 0) {
            this.#post(outcome);
        }
    }

    #getLogicals() {
        let toke = undefined;
        if (this.#work.indexOf('&&', this.#index) === this.#index) {
            toke = {
                index: this.#index,
                type: TokeTypes.logicalAnd,
                family: TokeFamilies.operator,
                content: this.#delete(2)
            };
        } else if (this.#work.indexOf('||', this.#index) === this.#index) {
            toke = {
                index: this.#index,
                type: TokeTypes.logicalOr,
                family: TokeFamilies.operator,
                content: this.#delete(2)
            };
        }

        this.#post(toke);
    }

    #getFilter() {
        let toke = {
            index: this.#index,
            type: TokeTypes.filter,
            family: TokeFamilies.metadata,
            content: this.#pop()
        }

        this.#post(toke);
    }

    #getSequenceMarker() {
        let toke = {
            index: this.#index,
            type: TokeTypes.sequence,
            family: TokeFamilies.sequencing,
            content: this.#pop()
        }

        this.#post(toke);
    }

    #getMergeSequenceMarker() {
        let toke = {
            index: this.#index,
            type: TokeTypes.mergeSequence,
            family: TokeFamilies.sequencing,
            content: this.#pop()
        }

        this.#post(toke);
    }

    #getObjectizeMarker() {
        let toke = {
            index: this.#index,
            type: TokeTypes.objectize,
            family: TokeFamilies.metadata,
            content: this.#pop()
        }

        this.#post(toke);
    }

    #getConvertIncludeOperator() {
        const oldIndex = this.#index;
        this.#pop();
        this.#pop();

        let toke = {
            index: oldIndex,
            type: TokeTypes.convertInclude,
            family: TokeFamilies.conversion,
            content: '+>'
        }

        this.#post(toke);
    }

    #getConvertBlockOperator() {
        const oldIndex = this.#index;
        this.#pop();
        this.#pop();

        let toke = {
            index: oldIndex,
            type: TokeTypes.convertBlock,
            family: TokeFamilies.conversion,
            content: '->'
        }

        this.#post(toke);
    }

    #getConvertIfFoundOperator() {
        const oldIndex = this.#index;
        this.#pop();
        this.#pop();
        this.#pop();

        let toke = {
            index: oldIndex,
            type: TokeTypes.convertIfFound,
            family: TokeFamilies.conversion,
            content: '!!>'
        }

        this.#post(toke);
    }

    #getConvertIfNotFoundOperator() {
        const oldIndex = this.#index;
        this.#pop();
        this.#pop();

        let toke = {
            index: oldIndex,
            type: TokeTypes.convertIfNotFound,
            family: TokeFamilies.conversion,
            content: '!>'
        }

        this.#post(toke);
    }

    #getConvertNotRequired() {
        const oldIndex = this.#index;
        this.#pop();

        let toke = {
            index: oldIndex,
            type: TokeTypes.convertNotRequired,
            family: TokeFamilies.conversion,
            content: '-'
        }

        this.#post(toke);
    }

    #getExternal() {
        const oldIndex = this.#index;
        this.#pop();

        let toke = {
            index: oldIndex,
            type: TokeTypes.external,
            family: TokeFamilies.external,
            content: '$'
        }

        this.#post(toke);
    }

    #getArraydicateMarker() {
        let toke = {
            index: this.#index,
            type: TokeTypes.enumerate,
            family: TokeFamilies.metadata,
            content: this.#pop()
        }

        this.#post(toke);
    }

    #getBooleans() {
        let toke = undefined;
        if (this.#work.indexOf('true', this.#index) === this.#index) {
            toke = {
                index: this.#index,
                type: TokeTypes.true,
                family: TokeFamilies.expression,
                content: Boolean(this.#delete(4))
            };
        } else if (this.#work.indexOf('false', this.#index) === this.#index) {
            toke = {
                index: this.#index,
                type: TokeTypes.false,
                family: TokeFamilies.expression,
                content: Boolean(this.#delete(5))
            };
        }

        this.#post(toke);
    }

    #getNumbers() {
        let outcome;
        const oldIndex = this.#index;
        let found = '';
        while (Number.isInteger(this.#peek())) {
            found = `${found}${this.#delete()}`;
        }

        if (this.#peek(0, 2) === '\\.') {
            // this is a separator.  eat the escape and leave the separator alone
            this.#delete();
        } else if (this.#peek() === '.' && Number.isInteger(this.#peek(1, 1))) {
            // this is a decimal point
            found = `${found}${this.#delete()}`;

            while (Number.isInteger(this.#peek())) {
                found = `${found}${this.#delete()}`;
            }
        }

        outcome = {
            index: oldIndex,
            type: TokeTypes.number,
            family: TokeFamilies.expression,
            content: Number(found)
        }

        if (this.#log.count() === 0) {
            this.#post(outcome);
        }
    }

    #getValue() {
        let outcome = undefined;

        // values are denoted by quotes (')
        const delimiter = this.#peek();
        const oldIndex = this.#index;
        let found = '';

        // opening delimiter (can be either, but the last one has to match it)
        if (['"', "'"].includes(this.#peek())) {
            this.#delete();
        } else {
            this.#logError({
                index: oldIndex,
                reason: "' or \" expected"
            });
            return;
        }

        while (this.#peek() !== delimiter && this.#end() === false) {
            if (this.#peek() === '\\' && this.#peek(1) === delimiter) {
                found = `${found}${this.#delete(2)}`;
            } else {
                found = `${found}${this.#delete()}`;
            }
        }

        // trailing delimiter
        if (this.#peek() === delimiter) {
            this.#delete();
        } else {
            this.#logError({
                index: oldIndex,
                reason: "' or \" expected"
            });
            return;
        }
        outcome = {
            index: oldIndex,
            type: TokeTypes.value,
            family: TokeFamilies.expression,
            content: found
        };

        if (this.#log.count() === 0) {
            this.#post(outcome);
        }
    }

    //
    #getFunction() {
        const oldIndex = this.#index;
        const content = this.#pop();

        let toke = {
            index: oldIndex,
            type: TokeTypes.function,
            family: TokeFamilies.key,
            content: content
        }

        this.#post(toke);
    }

    #getArray() {
        const oldIndex = this.#index;
        const content = this.#pop();

        let toke = {
            index: oldIndex,
            type: TokeTypes.array,
            family: TokeFamilies.key,
            content: content
        }

        this.#post(toke);
    }

    // any text is an item, these will eventually become values and keys
    #getKey() {
        let outcome = {
            index: this.#index,
            type: TokeTypes.key,
            family: TokeFamilies.key,
            content: undefined
        }
        let found = '';
        let containsWhitespace = false;

        // loop through and go until we find the end or another separator
        while (this.#end() === false && this.#peek() !== this.#separator) {
            if (isValidKey(`${found}${this.#peek()}`) === true) {
                const ch = this.#delete();
                found = `${found}${ch}`;
                containsWhitespace = containsWhitespace === true || WhitespaceConstant.indexOf(ch) > -1;
            } else {
                break;
            }
        }

        // it is possible to enter a situation where a key is expected, but there is none because it was just some whitespace
        // if that is the case, found will be empty and the next #peek will be whitespace
        if (found === '' && WhitespaceConstant.indexOf(this.#peek()) > -1) {
            // eat all of the whitespace
            while (WhitespaceConstant.indexOf(this.#peek()) > -1) {
                this.#delete();
            }

            return;
        } else {
            // now check what we got
            outcome.content = found;

            if (this.#log.count() === 0) {
                this.#post(outcome);
            }
        }
    }

    #getAnyKey() {
        // an "any" key is a key that can be in any format.
        // for example "  gks.2ol!" isn't possible with a non-denoted key
        // any keys are denoted with the & symbol, like so &  gks.2ol!&

        let outcome = undefined;

        // denoted keys are marked by ampersands (&)
        const delimiter = this.#peek();
        const oldIndex = this.#index;
        let found = '';

        // opening delimiter (can be either, but the last one has to match it)
        if (['&'].includes(this.#peek())) {
            this.#delete();
        } else {
            this.#logError({
                index: oldIndex,
                reason: "& expected"
            });
            return;
        }

        while (this.#peek() !== delimiter && this.#end() === false) {
            if (this.#peek() === '\\' && this.#peek(1) === delimiter) {
                found = `${found}${this.#delete(2)}`;
            } else {
                found = `${found}${this.#delete()}`;
            }
        }

        // trailing delimiter
        if (this.#peek() === delimiter) {
            this.#delete();
        } else {
            this.#logError({
                index: oldIndex,
                reason: "& expected"
            });
            return;
        }
        outcome = {
            index: oldIndex,
            type: TokeTypes.key,
            family: TokeFamilies.key,
            content: found
        };

        if (this.#log.count() === 0) {
            this.#post(outcome);
        }
    }
}