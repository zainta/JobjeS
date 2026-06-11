import { duplicate, isJSIdentifier, isNumeric, isRegex } from "./jobjesUtility.mjs";

/*
Copyright (C) Zain T. Al-Ahmary

MIT license.  I am not responsible for how you use or what happens as a result of what you use this for.
*/

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

    number: '#',
    value: "value",
    true: 'true',
    false: 'false',
    positive: '!!',
    negative: '!',
    logicalAnd: '&&',
    logicalOr: '||',

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
     */
    constructor() {
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
        return this.#tokes;
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
        this.#log = [];

        while (this.#end() === false && this.#log.length === 0) {
            if (this.#peek(0, this.#separator.length) === this.#separator) {
                this.#getSeparator();
            } else if (this.#peek() === '!') {
                this.#getAlignments(); // ! and !!
            } else if (this.#peek() === '*') {
                this.#getWildcards(); // * and **
            } else if (this.#peek() === '(' || this.#peek() === ')') {
                this.#getParenthesisBorder(); // ( and )
            } else if (this.#peek() === '[' || this.#peek() === ']') {
                this.#getSubqueryBorder(); // [ and ]
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
            } else if (this.#peek() === '+') {
                this.#getMergeSequenceMarker();
            } else if (this.#peek() === '>') {
                this.#getObjectizeMarker();
            } else if (this.#peek() === '<') {
                this.#getArraydicateMarker();
            } else if (this.#peek(0, 4) === 'true' || this.#peek(0, 5) === 'false') {
                this.#getBooleans();
            } else if (Number.isInteger(this.#peek())) {
                this.#getNumbers();
            } else if (this.#peek() === "'") {
                this.#getValue();
            } else if (this.#peek() === ';') {
                this.#getFunction();
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
            type: TokeTypes.separator,
            family: TokeFamilies.metadata,
            content: this.#pop(0, this.#separator.length)
        }

        this.#post(toke);
    }

    #getDivider() {
        let toke = {
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
                type: found.length === 1 ? TokeTypes.negative : TokeTypes.positive,
                family: TokeFamilies.expression,
                content: found
            };
        } else {
            this.#log.push({
                index: oldIndex,
                reason: "Excessive !'s found.  Either use 1 (does not exist) or 2 (exists).  Syntax error found.  Check query"
            });
        }

        if (this.#log.length === 0) {
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
                type: found.length === 1 ? TokeTypes.any : TokeTypes.anyAtAll,
                family: TokeFamilies.key,
                content: found
            };
        } else {
            this.#log.push({
                index: oldIndex,
                reason: "Excessive *'s found.  Either use 1 (any) or 2 (any at all).  Syntax error found.  Check query"
            });
        }

        if (this.#log.length === 0) {
            this.#post(outcome);
        }
    }

    #getParenthesisBorder() {
        const content = this.#pop();

        let toke = {
            type: content === '(' ? TokeTypes.openParenthesis : TokeTypes.closeParenthesis,
            family: TokeFamilies.expression,
            content: content
        }

        this.#post(toke);
    }

    #getSubqueryBorder() {
        const content = this.#pop();

        let toke = {
            type: content === '[' ? TokeTypes.startSubquery : TokeTypes.endSubquery,
            family: TokeFamilies.key,
            content: content
        }

        this.#post(toke);
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
            this.#log.push({
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
            this.#log.push({
                index: oldIndex,
                reason: "'/' expected"
            });
            return;
        }

        if (isRegex(found)) {
            outcome = {
                type: TokeTypes.regex,
                family: TokeFamilies.expression,
                content: found
            };
        } else {
            this.#log.push({
                index: oldIndex,
                reason: "Improper regular expression retrieved during query tokenization.  Syntax error detected.  Check query"
            });
        }

        if (this.#log.length === 0) {
            this.#post(outcome);
        }
    }

    #getLogicals() {
        let toke = undefined;
        if (this.#work.indexOf('&&', this.#index) === this.#index) {
            toke = {
                type: TokeTypes.logicalAnd,
                family: TokeFamilies.operator,
                content: this.#delete(2)
            };
        } else if (this.#work.indexOf('||', this.#index) === this.#index) {
            toke = {
                type: TokeTypes.logicalOr,
                family: TokeFamilies.operator,
                content: this.#delete(2)
            };
        }

        this.#post(toke);
    }    

    #getFilter() {
        let toke = {
            type: TokeTypes.filter,
            family: TokeFamilies.metadata,
            content: this.#pop()
        }

        this.#post(toke);
    }

    #getSequenceMarker() {
        let toke = {
            type: TokeTypes.sequence,
            family: TokeFamilies.sequencing,
            content: this.#pop()
        }

        this.#post(toke);
    }

    #getMergeSequenceMarker() {
        let toke = {
            type: TokeTypes.mergeSequence,
            family: TokeFamilies.sequencing,
            content: this.#pop()
        }

        this.#post(toke);
    }

    #getObjectizeMarker() {
        let toke = {
            type: TokeTypes.objectize,
            family: TokeFamilies.metadata,
            content: this.#pop()
        }

        this.#post(toke);
    }

    #getArraydicateMarker() {
        let toke = {
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
                type: TokeTypes.true,
                family: TokeFamilies.expression,
                content: Boolean(this.#delete(4))
            };
        } else if (this.#work.indexOf('false', this.#index) === this.#index) {
            toke = {
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
            type: TokeTypes.number,
            family: TokeFamilies.expression,
            content: Number(found)
        }

        if (this.#log.length === 0) {
            this.#post(outcome);
        }
    }

    #getValue() {
        let outcome = undefined;

        // values are denoted by quotes (')
        const oldIndex = this.#index;
        let found = '';

        // opening delimiter
        if (this.#peek() === "'") {
            this.#delete();
        } else {
            this.#log.push({
                index: oldIndex,
                reason: "' expected"
            });
            return;
        }

        while (this.#peek() !== "'" && this.#end() === false) {
            if (this.#peek() === '\\' && this.#peek(1) === "'") {
                found = `${found}${this.#delete(2)}`;
            } else {
                found = `${found}${this.#delete()}`;
            }
        }

        // trailing delimiter
        if (this.#peek() === "'") {
            this.#delete();
        } else {
            this.#log.push({
                index: oldIndex,
                reason: "' expected"
            });
            return;
        }
        outcome = {
            type: TokeTypes.value,
            family: TokeFamilies.expression,
            content: found
        };

        if (this.#log.length === 0) {
            this.#post(outcome);
        }
    }    

    //
    #getFunction() {
        const content = this.#pop();

        let toke = {
            type: TokeTypes.function,
            family: TokeFamilies.key,
            content: content
        }

        this.#post(toke);
    }

    // any text is an item, these will eventually become values and keys
    #getKey() {
        let outcome;
        const oldIndex = this.#index;
        let found = '';

        // array indexes are keys, so if it starts with a raw number (no quotes) then its an array index
        if (isNumeric(this.#peek())) {
            while (isNumeric(`${found}${this.#peek()}`) === true && this.#end() === false) {
                if (this.#peek() === '.' && isNumeric(this.#peek(1)) === false) {
                    break;
                }
                
                found = `${found}${this.#delete()}`;
            }
        } else { // otherwise, it has to follow javascript identifier rules (because javascript object)
            while (isJSIdentifier(`${found}${this.#peek()}`) === true && this.#end() === false) {
                found = `${found}${this.#delete()}`;
            }
        }


        outcome = {
            type: TokeTypes.key,
            family: TokeFamilies.key,
            content: found
        };

        if (this.#log.length === 0) {
            this.#post(outcome);
        }
    }
}