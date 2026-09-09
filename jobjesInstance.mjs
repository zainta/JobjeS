import { JobjeSTokenizer, TokenSubTypes, TokenTypes } from './jobjesTokenizer.mjs';
import { jobjesLog, LogNatures } from './jobjesLog.mjs';
import { isRegex } from './jobjesUtility.mjs';
import jobjesStripeTracker from './jobjesStripeTracker.mjs';

/*
Copyright (C) Zain T. Al-Ahmary

MIT license.  I am not responsible for how you use or what happens as a result of what you use this for.
*/

/**
 * JobjeS is short for JavaScript Object Search.
 * 
 * Functionality:
 * This object allows a regular expression like query to be executed against an arbitrary array or object literal structure 
 * and return any items that match the query
 * 
 * It follows the form:
 * <item>.<item>.etc.
 * 
 * Queries are broken up into subqueries.  These can be defined explicitly with square brackets ([]) or implicitly (they are used behind the scenes anyway)
 * Multiple queries can be executed in sequence (note that context resets between subqueries) via the sequence operator (,) and merge operator (+).
 * The merge operator concatenates results between the merged queries, but otherwise does not modify them.  The sequence operator carries each set as its own array.
 * 
 * e.g. <item>.<item>,<item>.<item>+<item>.<item>
 * 
 * This allows batch execution of multiple queries against a single object.
 * 
 * There are three key terms in the way queries are executed:
 *      Selects:
 *          A select is anything that moves the context forward.  This is limited to paths.
 *          (i.e. sequences of references to properties, termed keys, within the structure)
 * 
 *          e.g. given the object { set: [ 1, 2, 3, 4 ], id: 'first' }
 *              'set' and 'id' are keys in the immediate context.  
 *              So are 1, 2, 3, and 4 within the context of the array under 'set'.
 *      Conditions:
 *          A condition is anything that is used to filter results.  
 * 
 *          They come in two forms:
 *              Full:
 *                  A full condition is a key followed by a divider (default ':') and then a value item.  (more on that later).  
 * 
 *                  When executing a full condition, the value item is evaluated against the content of the given key 
 *                  without altering the context.
 *              Nested:
 *                  A nested condition is a value item, whether following an operator or separator.  (more on those later).
 * 
 *                  When executing a nested condition, the value item is evaluated against the current context.
 *          
 *          All conditions limit the context of operations that follow them, but do not act as selects.
 *      Parentheticals:
 *          A parenthetical, i.e. operations within parenthesis, executes under the originating context, 
 *          but any changes it makes to context are limited in scope to it.  This means that any selects that occur within
 *          it are forgotten when leaving the parenthesis.
 * 
 *          Parentheticals can be nested "infinitely".  Heaps do exist.
 * 
 * Below are the selects within the system:
 *      <key> : any direct reference to a property name is termed a "key", and will only match that key.
 *          Within the current context, this will move the execution context to the content of that key.  
 *          Meaning that given the structure, { set: [ 1, 2, 3, 4 ], id: 'first' }, 
 *          the key 'set' will result in the context moving to the array under set.  i.e. [ 1, 2, 3, 4 ]
 *
 *          Note: version 1.5.0 introduces "any" keys, which can contain any characters.  
 *          They are denoted with a pair of &'s, just lika a string is denoted with "'s.
 * 
 *          * : This select matches "any" key.  Meaning, within the structure, { set: [ 1, 2, 3, 4 ], id: 'first' },
 *          the '*' select would match the content of both 'set' and 'id'.
 * 
 *         ** : This select matches "any and all".  It does the same thing as *, but to every possible depth, traversing the entire 
 *          structure and executing subsequent query details against each sub item.  Obviously, this is massively costly in terms of 
 *          relative execution time, especially in large structures.
 * 
 *          @ : This select matches "any array" key.  This functions identically to '*' except that it does not match objects.  
 * 
 *   Function : A function call follows the form <key>;<parameter tag>.  A <parameter tag> is a term, 
 *          provided as a parameter as seen in the accompanying examples, that is a reference to the parameter array for the function.
 *          If the function does not require parameters, this should be omitted.  Functions can be used as normal selects and 
 *          as the left part of a full condition. 
 * 
 *     Filter : A filter is identical to a full condition except that it acts like a select, advancing the context.
 * 
 *  Conversion: A conversion is a block, marked by a pair of curly brackets, {}, and populated by conversion operations, that builds an object literal.  What follows is a description of the conversion operations.
 *              +> : Inclusions follow the pattern [subquery]+>[pathrun], where the subquery retrieves value(s) and they are inserted into the resulting object at the given pathrun location.
 *              -> : Blocks remove the provided pathrun from the result object literal.  They follow this pattern: [pathrun]->
 *             !!> : If found operations follow this pattern: [subquery]!!>[subquery] or [value],[pathrun].  They execute the first query, and if they find something, they execute the second query and use the result, or use the literal value, and place it at the pathrun in the resulting object literal.
 *              !> : If not found operations follow this pattern: [subquery]!>[subquery] or [value],[pathrun].  They execute the first query, and if they do not find something, they execute the second query and use the result, or use the literal value, and place it at the pathrun in the resulting object literal.
 * 
 *      Note: Any existing path that contains a single value (number, string, etc) that is updated, will be overwritten.
 *      Note: By default, all conversion operations are required to succeed for anything to be returned, but they can be made optional by immediately preceding the operator with a dash (-).
 *      Note: By default, conversions start empty and are filled by the user.  You can, make them "inclusive", i.e., automatically copy all entries that are not accounted for by explicit conversion operations over afterward.  This is done by adding a '+' just inside of the opening curly bracket '{}'.
 * 
 *  External Function:
 *          An external function is an inbuilt (or user added) function that can be called during a query.  External functions' names follow <key> rules, meaning that they can have spaces.
 *          They are referenced by their name, as defined in the external function array, preceded by a dollar sign '$' and followed by parenthesis.  In the form '$<function name>([param,param,...])'.
 *              The function set can be modified using these functions (off of both the instance and static objects):
 *                  static addExternal(name, description, func)
 *                  static getExternals()
 * 
 *          External functions receive the parameters as follows (in this order):
 *              The current context:
 *                  The current query execution context.
 *              The current relationship monitor:
 *                  A simple class that monitors parental relationships within the queried structure.
 *              Any parameters supplied through the query (executed as querires):
 *                  The parameters the user explicitly supplies between the parenthesis in the call.
 * 
 *                  Note: to provide literals to an external function, precede them with a '$'.  This will make the value immediately following count as a <parameter tag>, like those used for functions (see above).  Also reference Function Examples in the example code.
 *                  e.g. $count('this is a query', $'this is a literal')
 *          External functions can return an object literal, array, or scalar value.  They change context, and thus count as selects.
 * 
 * Below are the value items within the system:
 *      Note that all definitions below are full conditions.  To convert them into nested conditions, 
 *          simply remove the key and divider (default ':').
 * 
 *         <key>:!! : exists, checks to see if the given <key> is defined on the object
 * 
 *          <key>:! : does not exist, checks to see if the given <key> is not defined on the object  
 *              (never matches as a nested, because the context must exist prior to it getting evaluated)
 * 
 *  <key>:!!<value> : positive value, checks to see if the given <key> has the given value
 * 
 *   <key>:!<value> : negative value, checks to see if the given <key> does not have the given value
 * 
 *   <key>:/regexp/ : regular expression, checks to see if the given <key>'s value matches the regular expression
 * 
 * 
 *  To connect conditions and parentheticals, operators can be used.  The following operators are supported:
 * 
 *      && : Ensures that all conditions / parentheticals in the chain evaluate as true.
 *      || : Ensures that at least one of the conditions / parentheticals in the chain evaluates as true.
 * 
 *   Subqueries support post operators. (placed immediately following the query itself)  
 *   They support the following:
 * 
 *      > :
 *          The '>' post operator maintains the state of object results from queries.  This will, for example, return a clean array of objects from the '*' operator, rather than every object and its properties.
 *      < :
 *          The '<' post operator enumerates the query results. This, for example, will return an array of the properties in an object literal rather than the object itself.
 * 
 * Note for usage:
 *      When using this system, context is massively important.  If the results you get aren't what you expected, consider context.
 * 
 * version 1.1.0:
 *      Added functions
 * 
 * version 1.2.0:
 *      Added filters and fixed a bug in parentheticals
 * 
 * version 1.3.0:
 *      Added subqueries, objectization, and enumeration
 * 
 * version 1.4.0:
 *      Added the array select '@' and conversions
 *      Revamped > and < query operators to be more consistent.  
 *          Note that they aren't capable of altering context, 
 *              they only find the closest (immediate or direct parent) object when doing their task
 * 
 * version 1.5.2:
 *      Keys no longer conform to JS naming convensions, allowing spaces and abnormal characters.  They are still case sensitive.
 *          Implemented "any" keys.  (e.g. &<key>&)
 *      String values now support both single and double quotes. (' and ")
 *      Added support for external functions.  
 *          These functions are defined in a user editable array on the JobjeS object.
 *      Made an optimization pass
 *          Rebuilt the system to make queries step between the items in the structure, rather than the key sets in the items
 *              THIS IS A BREAKING CHANGE DUE TO FORCING QUERIES TO START AT THE FIRST NODE INSTEAD OF ITS CONTENTS
 *      Restructured the object system
 *          Offloaded all functionality from the static object 'JobjeS' into an instanced object 'JobjeSInstance' (that can be used for persistent configuration)
 *          Static object is now a wrapper (exposed functionality has grown to support external function configuration)
 *          Namespaces:
 *              Static object 'JobjeS' is in namespace 'jobjes'
 *              Instance object 'JobjeSInstance' is in namespace 'jobjes/instance'
 */
export default class JobjeSInstance {
    #targetDivider = ':';
    #pathseparator = '.';
    #log = undefined;
    #autoResetLog = false;
    #onEachFound = undefined;
    #parameterDictionary = {};
    #runningResults = undefined;

    #tracker = undefined; // used to track the queried object's hierarchy

    #anchor = undefined; // this is a reference to the root of the structure the query is running against
    #anchorCache = {}; // used to cache anchor conversion queries (since their result won't change)
    static #externals = [
        {
            'name': 'count',
            'func': (context, monitoring, param) => {
                let outcome = undefined;

                if (Array.isArray(param)) {
                    outcome = param.length;
                } else if (typeof param === 'string') {
                    outcome = param.length;
                } else if (typeof param === 'object') {
                    outcome = Object.entries(param).length;
                }

                return outcome;
            },
            'desc': 'Takes an query result (param) and returns a contextual count from it.  String: length, Array: length, Object: number of properties.'
        }
    ];

    /**
     * Safely adds an external function
     * @param {string} name The unique name key of the function
     * @param {string} description A description of how the function works
     * @param {function} func The function itself.  Note that any parameters beyond the first will have to be provided through subqueries.
     * @returns an object describing the outcome.  The success property always states the outcome as true or false
     */
    static addExternal(name, description, func) {
        let outcome = {
            success: true
        };

        if (this.#externals.filter((item) => item.name === name).length === 0) {
            this.#externals.push({
                'name': name,
                'func': func,
                'desc': description
            });
        } else {
            outcome = {
                success: false,
                reason: 'Name is already taken'
            }
        }

        return outcome;
    }

    /**
     * Returns the actual array containing the defined external functions
     * @returns The actual external function array instance
     */
    static getExternals() {
        return this.#externals;
    }

    /**
     * Create a jobjes instance
     * @param {boolean} [autoResetLog=false] If true, every execution will automatically clear the log
     * @param {string} [divider=':'] The divider character to use
     * @param {string} [separator='.'] The path separator character to use
     * @param {function} onEachFound An optional function, of the form function(item, parent), that will be called each time a match is found
     * @param {object} [parameterDictionary={}] A dictionary of key->parameter array sets for use with any function calls
     * @param {any[]} [logStorage=[]] If provided, sets the array used for log storage
     */
    constructor(autoResetLog = false, onEachFound = undefined, parameterDictionary = {}, logStorage = [], divider = ':', separator = '.') {
        this.#autoResetLog = autoResetLog;
        this.#onEachFound = onEachFound;
        this.#parameterDictionary = parameterDictionary;
        this.#targetDivider = divider;
        this.#pathseparator = separator;
        this.#log = new jobjesLog(logStorage);
    }

    /**
     * Returns all of the entries in a copy of the log array
     * @returns Returns a copy of the log array, not the actual array
     */
    getLog() {
        return this.#log.all();
    }

    /**
     * Returns the actual log array instance
     * @returns Returns the actual log array
     */
    getLogStack() {
        return this.#log.actual();
    }

    /**
     * Filters the entries and returns the results
     * Logs should have some (but not necessarily all of) the following properties:
     *      nature: see LogNatures object
     *      date: when the entry was made (note that this field is a number)
     *      reason: why the entry was made (the error message)
     *      error: the exception that triggered the entry
     *      location: the character index from the start of the line where the entry was triggered
     * @param {function} filterFunc A filter function for use with Array.filter
     */
    getFilteredLog(filterFunc) {
        return this.#log.filter(filterFunc);
    }

    /**
     * Return the logger itself
     * @returns The actual jobjesLog instance
     */
    getActualLog() {
        return this.#log;
    }

    /**
     * Adds a log entry
     * @param {string} reason The log message
     * @param {object | Number} location Either a coordinate set, or the distance from line start
     * @param {object} [error=undefined] If provided, makes the entry an error entry
     * @param {object} [furtherInfo=undefined] If provided, will be merged into the resulting entry
     * @param {Array} [log=undefined] If provided, the log entry will be posted to this log instead of the standard one
     */
    #entry(reason, location, error = undefined, furtherInfo = undefined, log = undefined) {
        let type = LogNatures.Informative;
        if (!!error) {
            type = LogNatures.Error;
        }

        switch (type) {
            case LogNatures.Error:
                if (!!log && !!log.logError) {
                    log.logError(reason, error, location, furtherInfo);
                } else {
                    this.#log.logError(reason, error, location, furtherInfo);
                }
                break;
            case LogNatures.Informative:
                if (!!log && !!log.logError) {
                    log.logError(reason, location, furtherInfo);
                } else {
                    this.#log.logInfo(reason, location, furtherInfo);
                }
                break;
        }
    }

    /**
     * Takes an object and removes all "first", "next", and "parent" properties.  
     * These properties are self-references in the query structure and prevent JSONification.
     * @param {object} obj The object to act on
     * @returns {object} The resulting object
     */
    #stripSelfReferences(obj) {
        if (!!obj.next) {
            delete obj.next;
        }

        if (!!obj.first) {
            delete obj.first;
        }

        if (!!obj.parent) {
            delete obj.parent;
        }

        Object.entries(obj).forEach((set) => {
            if (typeof set[1] === 'object') {
                this.#stripSelfReferences(set[1]);
            }
        });

        return obj;
    }

    /**
     * Adds the given item to the given array
     * @param {any} item 
     * @param {Array} set 
     */
    #post(item, set) {
        if (this.#contains(set, item) === false) {
            set.push(item);
        }
    }

    // check if an item is contained within an array 
    // in a manner that catches non-instance based duplicates
    #contains(arr, itm) {
        const strItem = JSON.stringify(itm);

        let found = false;
        arr.forEach((aItm, index) => {
            if (JSON.stringify(aItm) === strItem) {
                found = true;
            }

            if (found) {
                return;
            }
        });

        return found;
    }

    /**
     * Merges two arrays and returns the result
     * @param {Array} set1 The first array
     * @param {Array} set2 The second array
     * @param {boolean} [allowDupes = false] If true, allows duplicates in the resulting array
     * @returns The merged array
     */
    #merge(set1, set2, allowDupes = false) {
        let outcome = [];

        if (allowDupes === true) {
            set1.forEach((item) => {
                outcome.push(item);
            });

            set2.forEach((item) => {
                outcome.push(item);
            });
        } else {
            // make a stringified version of each

            // note, this will lose functions if they are included, 
            // so just merging them isn't possible
            let str1 = set1.map((item) => JSON.stringify(item));
            let str2 = set2.map((item) => JSON.stringify(item));

            // instead, iterate through the first one, checking if the second one includes its items
            // add the ones that aren't duplicated while tracking the ones that are
            let dupes = [];
            str1.forEach((strItem, index) => {
                if (str2.includes(strItem)) {
                    dupes.push(index);
                } else {
                    // don't add the stringified version,
                    //  add the original to prevent function loss
                    outcome.push(set1[index]);
                }
            });

            // one the first iteration is completed,
            // loop through the other array, only adding the non-dupes to the outcome
            set2.forEach((item, index) => {
                if (dupes.includes(index) === false) {
                    outcome.push(item);
                }
            })
        }

        return outcome;
    }

    /**
     * Executes a query against the subject and then calls the provided callback against each match.  Returns the set of matches.
     * 
     * @param {String} query The query to execute
     * @param {Array | object} subject The object to execute it against (an object or array)
     * 
     * Returns an array containing all matches
     */
    #find(query, subject) {
        if (typeof query !== 'string') return [];
        if (typeof subject !== 'object' && !Array.isArray(subject)) {
            this.#entry('Query target must be an object literal or array.', 0, subject);
            return [];
        }

        const tokenizer = new JobjeSTokenizer(this.#parameterDictionary, this.#log.actual());
        const queries = tokenizer.Tokenize(query, this.#targetDivider, this.#pathseparator);
        if (this.#log.count() > 0) {
            return [];
        } else if (queries.length === 0) {
            this.#entry("No tokens generated during initial processing", 0, subject);
            return [];
        }

        this.#runningResults = [];

        this.#tracker = new jobjesStripeTracker();
        this.#tracker.explore(subject);

        // loop through the queries until done, giving them each their own result array
        queries.forEach((sequence, index) => {
            let result = [];
            this.#resolve(sequence.content, subject, result, sequence.postOperation, this.#log);

            // before we sequence, we have to check if the subquery needs to be converted
            if (!!sequence.conversion) {
                let conversionResult = [];
                this.#resolveConversion(sequence.conversion, result, conversionResult, this.#log, true);
                result = conversionResult;
            }

            if (!!sequence.sequencer) {
                switch (sequence.sequencer.type) {
                    case TokenTypes.sequence: // one after another
                        this.#runningResults.push(result);
                        break;
                    case TokenTypes.mergeSequence: // combine with the previous
                        const last = this.#runningResults.splice(this.#runningResults.length - 1, 1);
                        // only way this should ever fail is if, somehow, there is a merge on the first sequence 
                        // (which will be error-lessly ignored)
                        if (last.length === 1) {
                            this.#runningResults.push(last.concat(result));
                        } else {
                            this.#runningResults.push(result);
                        }
                        break;
                }
            } else {
                this.#runningResults.push(result);
            }

            // loop through and trigger the onEachFound event
            if (!!this.#onEachFound) {
                result.forEach((item) => {
                    this.#onEachFound(item, this.#tracker.ancestor(item));
                });
            }
        });

        if (this.#runningResults.length === 1) {
            return this.#runningResults[0];
        } else {
            return this.#runningResults;
        }
    }

    /**
     * Resolves the given series of query steps and returns the resolution
     * @param {object} querySteps The current query to resolve
     * @param {object | Array} target The current contextual target within the queried structure
     * @param {Array} result The result array.  Populated by endpoint matches
     * @param {object} postOperation the post operation to perform, if any
     * @param {jobjesLog} log An optional log to post errors to
     */
    #resolve(querySteps, target, result, postOperation, log) {
        let outcome;

        // originally, this function took a key as a parameter.  
        // Now, it will evaluate a step against a target item.
        // no key involved.

        // separators are metadata, and are discarded
        const step = querySteps[0].type === TokenTypes.separator ? querySteps[1] : querySteps[0];

        // this is the index of the last step that was executed this pass
        let stepIndex = querySteps.indexOf(step);

        // all specific resolution functions i.e. resolveXXXXX will return:
        //      an object of the form:
        //      { matched: <boolean>, [indexer: <function>], [target: <object>], [isSelect: <boolean>] }
        //
        //          matched tells resolve if the test passed, if false we return nothing
        //          indexer is a function to generate a listing of targets to continue on, 
        //              this supercedes target and will only be present in specific situations 
        //              (like after resolving an array with a wildcard match)
        //          target is a hard target transition, if present it will supercede the target function parameter
        //          isSelect, if present,  will override default Select / non-Select behavior

        switch (step.type) {
            case TokenTypes.condition:
            case TokenTypes.parenthetical:
                // because parentheticals and conditions can appear in series and freely mixed, 
                // when they are sequential, because they are not nested, 
                // it is important to consume the entire run of them since the result is dependant on the entire run
                let nextStep = step;
                while (nextStep.type === TokenTypes.parenthetical || nextStep.type === TokenTypes.condition) {
                    if (nextStep.type === TokenTypes.parenthetical) {
                        outcome = this.#resolveParenthetical(nextStep, target, result, log);
                    } else if (nextStep.type === TokenTypes.condition) {
                        outcome = this.#resolveCondition(nextStep, target, result, log);
                    }

                    // after a parenthetical or condition, we have to check if the next item is another of either.
                    // if it is, 
                    //      then we have to paste the previous step's outcome onto it 
                    //      so it has the value required by any operators that may be present
                    const checkedStep = querySteps.length > querySteps.indexOf(nextStep) + 1 ?
                        querySteps[querySteps.indexOf(nextStep) + 1] :
                        undefined;

                    if (!!checkedStep &&
                        ((checkedStep.type === TokenTypes.condition) || (checkedStep.type === TokenTypes.parenthetical)) &&
                        checkedStep.precedingOperator !== undefined) {
                        // only nested conditions required the original context, if present
                        if (checkedStep.subType === TokenSubTypes.nestedCondition) {
                            // transfer the chained context key to the nested condition
                            checkedStep.chainContextKey = nextStep.chainContextKey;
                        }

                        nextStep = checkedStep;
                        nextStep.precedingOutcome = outcome.matched;
                    } else {
                        // if the opening token was a full condition, these results are full, not nested
                        if (step.subType === TokenSubTypes.fullCondition) {
                            outcome.type = 'full';
                        }

                        break;
                    }
                }

                stepIndex = querySteps.indexOf(nextStep);
                break;
            case TokenTypes.pathRun:
                outcome = this.#resolvePathRun(step, target, result, postOperation, log);
                break;
            case TokenTypes.conversion:
                outcome = this.#resolveConversion(step, target, result, log);
                break;
            case TokenTypes.key:
                if (step.subType === TokenSubTypes.function) {
                    outcome = this.#resolveFunction(step, target, result, log);
                } else {
                    this.#entry(`Unknown key sub type. ${JSON.stringify(step)}`, 0, undefined, undefined, log);
                }
                break;
            case TokenTypes.external:
                outcome = this.#resolveExternal(step, target, result, log);
                break;
        }

        // the target the next resolve call will act on
        const determinationTarget = outcome.isSelect === true ? outcome.target : target;

        // the step subset handed to the next resolve call
        const nextStepSet = querySteps.slice(stepIndex + 1);

        // now that we know that it matches or doesn't, we have to determine what to do
        if (outcome.matched) {
            // is there more query to process?
            if (stepIndex + 1 < querySteps.length) {
                // note that the indexer and the target come from the operations, 
                //      so select and non-selects will be handled by the operation, and not here.

                // check if we have an indexer method
                // an indexer method returns the items that should be used from within determinationTarget.
                //      this list is already filtered / modified in any way in requires
                //
                // note: 
                //      this means that an indexer can return items entirely unrelated to what was passed into the operation
                if (!!outcome.indexer) {
                    if (typeof outcome.indexer === 'function') {
                        let items = [];
                        try {
                            items = outcome.indexer();

                            for (let i = 0; i < items.length; i++) {
                                const item = items[i];

                                this.#resolve(
                                    nextStepSet,
                                    item,
                                    result,
                                    undefined,
                                    log);
                            }
                        } catch (ex) {
                            this.#entry("The indexer threw an exception.", -1, ex, { thrower: step, remaining: nextStepSet }, log);
                        }
                    } else {
                        // indicates an error in the source code
                        this.#entry("Bad indexer passed on outcome.", -1, outcome, { query: querySteps }, log);
                    }
                } else {
                    if (Array.isArray(determinationTarget)) {
                        determinationTarget.forEach((item) => {
                            this.#resolve(
                                nextStepSet,
                                item,
                                result,
                                undefined,
                                log);
                        });
                    } else {
                        this.#resolve(
                            nextStepSet,
                            determinationTarget,
                            result,
                            undefined,
                            log);
                    }
                }
            } else {
                // this is the end of our search, and our target
                if (Array.isArray(determinationTarget)) {
                    determinationTarget.forEach((item) => {
                        this.#post(item, result);
                    });
                } else {
                    this.#post(determinationTarget, result);
                }

                /* if (postOperation?.objectize === true && !!outcome.container) {
                    // objectize maintains the object state of items returned,
                    // rather than returning their contents (as is the normal behavior)
                    if (!!outcome.container) {
                        if (Array.isArray(outcome.container)) {
                            outcome.container.forEach((item) => {
                                this.#post(
                                    item,
                                    result,
                                    onEachFound
                                );
                            });
                        } else {
                            this.#post(
                                outcome.container,
                                result,
                                onEachFound
                            );
                        }
                    } else {
                        this.#post(
                            outcome.container,
                            result,
                            onEachFound
                        );
                    }
                } else if (postOperation?.enumerate === true) {
                    if (!!outcome.container) {
                        if (Array.isArray(outcome.container)) {
                            outcome.container.forEach((item) => {
                                this.#post(
                                    item,
                                    result,
                                    onEachFound
                                );
                            });
                        } else {
                            this.#post(
                                outcome.container,
                                result,
                                onEachFound
                            );
                        }
                    } else {
                        // enumeration converts single objects into arrays of their properties' values
                        // and converts objects in an array in the same manner, but leaves nested arrays alone
                        let uniqueProcessed = [];

                        // convert each result into a key array
                        outcome.matches.forEach((subject, index) => {
                            if (uniqueProcessed.includes(subject.current) === false) {
                                const expandAndPost = (obj) => {
                                    if (Array.isArray(obj)) {
                                        this.#post(obj, result, onEachFound);
                                    } else {
                                        const keys = Object.entries(obj).map((set, index) => set[0]);

                                        this.#post(
                                            keys.map((key, index) => obj[key]),
                                            result,
                                            onEachFound
                                        );
                                    }
                                }

                                if (typeof subject.current === 'object') {
                                    expandAndPost(subject.current);
                                } else if (Array.isArray(subject.current)) {
                                    subject.current.forEach((item, index) => expandAndPost(item));
                                }

                                uniqueProcessed.push(subject.current);
                            }
                        });
                    }
                } else if (outcome?.result !== undefined) {
                    this.#post(outcome.result, result, onEachFound);
                } else {
                    if (outcome.isSelect !== false || outcome.type === 'nested') {
                        for (let i = 0; i < outcome.matches.length; i++) {
                            this.#post(outcome.matches[i].current[outcome.matches[i].key], result, onEachFound);
                        }
                    } else {
                        this.#post(container, result, onEachFound);
                    }
                } */
            }
        }
        // no matches means failure
    }

    /**
     * Parentheticals resolve down to the standard return object format:
     *     { matched: <boolean>, [indexer: <function>], [target: <object>], [isSelect: <boolean>] }
     *         matched tells resolve if the test passed, if false we return nothing
     *         indexer is a function to generate a listing of targets to continue on, 
     *             this supercedes target and will only be present in specific situations 
     *             (like after resolving an array with a wildcard match)
     *         target is a hard target transition, if present it will supercede the target function parameter
     *         isSelect, if present,  will override default Select / non-Select behavior
     * @param {object} step The parenthetical step to resolve
     * @param {object | Array} target The current contextual target within the queried structure
     * @param {Array} result The result array.  Populated by endpoint matches
     * @param {jobjesLog} log An optional log to post errors to
     * @returns An object of the form { matched: <boolean>, [indexer: <function>], [target: <object>], [isSelect: <boolean>] }
     */
    #resolveParenthetical(step, target, result, log) {
        // parentheticals are executed by running the contents of the parenthesis against the current context
        // this has no affect on the context, parentheticals are not selects
        let findings = [];

        this.#resolve(step.content, target, findings, undefined, log);

        let matched = findings.length > 0;
        if (!!step.precedingOperator && !!step.precedingOutcome) {
            if (step.precedingOperator.type === TokenTypes.or) {
                matched = (findings.length > 0) || step.precedingOutcome;
            } else if (step.precedingOperator.type === TokenTypes.and) {
                matched = (findings.length > 0) && step.precedingOutcome;
            }
        }

        return {
            matched: matched,
            indexer: undefined,
            target: findings,
            isSelect: false
        };
    }

    /**
     * Conditions resolve down to the standard return object format:
     *     { matched: <boolean>, [indexer: <function>], [target: <object>], [isSelect: <boolean>] }
     *         matched tells resolve if the test passed, if false we return nothing
     *         indexer is a function to generate a listing of targets to continue on, 
     *             this supercedes target and will only be present in specific situations 
     *             (like after resolving an array with a wildcard match)
     *         target is a hard target transition, if present it will supercede the target function parameter
     *         isSelect, if present,  will override default Select / non-Select behavior
     * @param {object} step The condition step to resolve
     * @param {object | Array} target The current contextual target within the queried structure
     * @param {Array} result The result array.  Populated by endpoint matches
     * @param {jobjesLog} log An optional log to post errors to
     * @returns An object of the form { matched: <boolean>, [indexer: <function>], [target: <object>], [isSelect: <boolean>] }
     */
    #resolveCondition(step, target, result, log) {
        const executeCondition = (condition, target, previousOutcome) => {
            let outcome = false;
            if (condition.type === TokenTypes.parenthetical) {
                outcome = this.#resolveParenthetical(condition, target, result)?.matched;
            } else if (condition.type !== TokenTypes.condition) {
                this.#entry(`Bad condition. ${JSON.stringify(condition)}`, 0, step, undefined, log);
            } else {
                // the rule is the condition criteria
                const rule = condition.content[0];

                // check the step against the value under key
                switch (rule.type) {
                    case TokenTypes.positiveValue:
                        // a positive value check means that we expect the given key to have the given value
                        outcome = target === rule.content;
                        break;
                    case TokenTypes.negativeValue:
                        // a negative value check means that we expect the given key to not have the given value
                        outcome = target !== rule.content;
                        break;
                    case TokenTypes.exists:
                        // an exists check checks to see if the given key exists on the given container
                        outcome = (!!target) === true;
                        break;
                    case TokenTypes.notexists:
                        // a not exists check checks to see if the given key does not exist on the given container
                        outcome = (!!target) === false;
                        break;
                    case TokenTypes.regex:
                        // a regex check :
                        //      applies the regular expression against the value within the given container 
                        //      under the given key and returns if it matches

                        if (isRegex(rule.content)) {
                            const re = new RegExp(rule.content);
                            if (typeof target === 'string') {
                                outcome = target?.match(re)?.length > 0;
                            } else {
                                outcome = JSON.stringify(target)?.match(re)?.length > 0;
                            }
                        } else {
                            this.#entry(`Regex condition did not contain valid regex. ${JSON.stringify(condition)}`, 0, step, undefined, log);
                        }
                        break;
                    default:
                        this.#entry(`Unknown condition type. ${JSON.stringify(condition)}`, 0, step, undefined, log);
                        break;
                }
            }

            if (!!condition.precedingOperator && previousOutcome !== undefined) {
                if (condition.precedingOperator.type === TokenTypes.or) {
                    outcome = outcome || previousOutcome;
                } else if (condition.precedingOperator.type === TokenTypes.and) {
                    outcome = outcome && previousOutcome;
                }
            }

            return outcome;
        }

        const executeNestedCondition = (condition, operator, target, previousOutcome, chainContextKey) => {
            const chainedConditionContext = !!chainContextKey ? target[chainContextKey] : target;

            let outcome = false;
            // the rule is the condition criteria
            const rule = condition;

            // check the step against the value under key
            switch (rule.type) {
                case TokenTypes.positiveValue:
                    // a positive value check means that we expect the given key to have the given value
                    outcome = chainedConditionContext === rule.content;
                    break;
                case TokenTypes.negativeValue:
                    // a negative value check means that we expect the given key to not have the given value
                    outcome = chainedConditionContext !== rule.content;
                    break;
                case TokenTypes.exists:
                    // an exists check checks to see if the given key exists on the given container
                    outcome = (!!chainedConditionContext) === true;
                    break;
                case TokenTypes.notexists:
                    // a not exists check checks to see if the given key does not exist on the given container
                    outcome = (!!chainedConditionContext) === false;
                    break;
                case TokenTypes.regex:
                    // a regex check :
                    //      applies the regular expression against the value within the given container 
                    //      under the given key and returns if it matches

                    if (isRegex(rule.content)) {
                        const re = new RegExp(rule.content);
                        if (typeof chainedConditionContext === 'string') {
                            outcome = chainedConditionContext?.match(re)?.length > 0;
                        } else {
                            outcome = JSON.stringify(chainedConditionContext)?.match(re)?.length > 0;
                        }
                    } else {
                        this.#entry(`Regex condition did not contain valid regex. ${JSON.stringify(condition)}`, 0, step, undefined, log);
                    }
                    break;
                default:
                    this.#entry(`Unknown condition type. ${JSON.stringify(condition)}`, 0, step, undefined, log);
                    break;
            }

            if ((!!condition.precedingOperator || !!operator) && previousOutcome !== undefined) {
                const op = !!condition.precedingOperator ? condition.precedingOperator : operator;

                if (op.type === TokenTypes.or) {
                    outcome = outcome || previousOutcome;
                } else if (op.type === TokenTypes.and) {
                    outcome = outcome && previousOutcome;
                }
            }

            return outcome;
        }

        const executeFunctionCondition = (func, condition, target, previousOutcome) => {
            let outcome = false;

            // step 1, confirm and execute the function.
            if (!!func) {
                const funcOutcome = this.#resolveFunction(func, target, [], log);

                // remember:
                // we don't care if the function fails, 
                // only that the outcome we *do* get from the function matches the condition
                // that means we must get something in the matches array
                if (!!funcOutcome.target) {
                    const funcContainer = funcOutcome.target;
                    const rule = condition.content[0];

                    // now, compare the result from the function to the condition (the function's outcome is the container)
                    switch (rule.type) {
                        case TokenTypes.positiveValue:
                            // a positive value check means that we expect the given key to have the given value
                            outcome = funcContainer === rule.content;
                            break;
                        case TokenTypes.negativeValue:
                            // a negative value check means that we expect the given key to not have the given value
                            outcome = funcContainer !== rule.content;
                            break;
                        case TokenTypes.exists:
                            // an exists check checks to see if the given key exists on the given container
                            outcome = (!!funcContainer) === true;
                            break;
                        case TokenTypes.notexists:
                            // a not exists check checks to see if the given key does not exist on the given container
                            outcome = (!!funcContainer) === false;
                            break;
                        case TokenTypes.regex:
                            // a regex check :
                            //      applies the regular expression against the value within the given container 
                            //      under the given key and returns if it matches

                            if (isRegex(rule.content)) {
                                const re = new RegExp(rule.content);
                                if (typeof funcContainer === 'string') {
                                    outcome = funcContainer.match(re)?.length > 0;
                                } else {
                                    outcome = JSON.stringify(funcContainer)?.match(re)?.length > 0;
                                }
                            } else {
                                this.#entry(`Regex condition did not contain valid regex. ${JSON.stringify(condition)}`, 0, step, undefined, log);
                            }
                            break;
                        default:
                            this.#entry(`Unknown condition type. ${JSON.stringify(condition)}`, 0, step, undefined, log);
                            break;
                    }
                }
            }

            if (!!condition.precedingOperator && previousOutcome !== undefined) {
                if (condition.precedingOperator.type === TokenTypes.or) {
                    outcome = outcome || previousOutcome;
                } else if (condition.precedingOperator.type === TokenTypes.and) {
                    outcome = outcome && previousOutcome;
                }
            }

            return outcome;
        }

        let outcome;

        if (step.subType === TokenSubTypes.fullCondition) {
            // full conditions do not advance
            // they include the relevant testing key

            // step 1, get the key
            if (step.content[0].type === TokenTypes.key) {
                const conditionKey = step.content[0].subType === TokenSubTypes.function ?
                    step.content[0].content[0].content :
                    step.content[0].content;

                // this is done to preserve the key context for any chained nested conditions, 
                // as they should execute against the same property value as the full condition
                step.chainContextKey = conditionKey;

                // step 2, confirm that a colon is next
                if (step.content[1].type === TokenTypes.divider || step.content[1].type === TokenTypes.filter) {
                    // if it's a normal divider then skip it.  we don't care, it just separates the key and the rule

                    let conditionResults = !!step.precedingOutcome ? [step.precedingOutcome] : [];
                    // step 3, get the condition tokens.
                    // everything from index 2 onward should be conditions, 
                    // so loop through them and perform the logical operations
                    for (let i = 2; i < step.content.length; i++) {
                        const lastOutcome = conditionResults.slice(conditionResults.length - 1);

                        if (step.content[0].subType === TokenSubTypes.function) {
                            conditionResults.push(
                                executeFunctionCondition(
                                    step.content[0],
                                    step.content[i],
                                    target, // the resolve function expects to be handed the instance containing the function
                                    lastOutcome.length === 1 ? lastOutcome[0] : undefined));
                        } else {
                            conditionResults.push(
                                executeCondition(
                                    step.content[i],
                                    target[conditionKey],
                                    lastOutcome.length === 1 ? lastOutcome[0] : undefined));
                        }
                    }

                    const lastOutcome = conditionResults.slice(conditionResults.length - 1);
                    // the only outcome we care about is the final one.
                    outcome = {
                        matched: lastOutcome.length === 1 ? lastOutcome[0] : false,
                        target: step.content[1].type === TokenTypes.filter ? target[conditionKey] : target,
                        isSelect: step.content[1].type === TokenTypes.filter, // the only difference between a filter and a normal full condition is that filters act as selects
                        type: 'full'
                    };
                } else {
                    this.#entry(`Malformed full condition: divider (default ':') expected as second token. ${JSON.stringify(step)}`, 0, step, undefined, log);
                }
            } else {
                this.#entry(`Malformed full condition: key expected as first token. ${JSON.stringify(step)}`, 0, step, undefined, log);
            }
        } else if (step.subType === TokenSubTypes.nestedCondition) {
            // nested conditions don't advance, either
            // they test against the target they are given as parameters (execution context)

            let conditionResults = !!step.precedingOutcome ? [step.precedingOutcome] : [];
            // in a nested condition, everything should be conditions, 
            // so loop through them and perform the logical operations
            for (let i = 0; i < step.content.length; i++) {
                const lastOutcome = conditionResults.slice(conditionResults.length - 1);
                conditionResults.push(
                    executeNestedCondition(
                        step.content[i],
                        step.precedingOperator,
                        target,
                        lastOutcome.length === 1 ? lastOutcome[0] : undefined,
                        step.chainContextKey));
            }

            const lastOutcome = conditionResults.slice(conditionResults.length - 1);
            // the only outcome we care about is the final one.
            outcome = {
                matched: lastOutcome.length === 1 ? lastOutcome[0] : false,
                target: target,
                isSelect: false,
                type: 'nested'
            };
        } else {
            this.#entry(`Bad condition sub type. ${JSON.stringify(step)}`, 0, step, undefined, log);
        }

        return outcome;
    }

    /**
     * Pathruns resolve down to the standard return object format:
     *     { matched: <boolean>, [indexer: <function>], [target: <object>], [isSelect: <boolean>] }
     *         matched tells resolve if the test passed, if false we return nothing
     *         indexer is a function to generate a listing of targets to continue on, 
     *             this supercedes target and will only be present in specific situations 
     *             (like after resolving an array with a wildcard match)
     *         target is a hard target transition, if present it will supercede the target function parameter
     *         isSelect, if present,  will override default Select / non-Select behavior
     * @param {object} step The condition step to resolve
     * @param {object | Array} target The current contextual target within the queried structure
     * @param {Array} result The result array.  Populated by endpoint matches
     * @param {jobjesLog} log An optional log to post errors to
     * @returns An object of the form { matched: <boolean>, [indexer: <function>], [target: <object>], [isSelect: <boolean>] }
     */
    #resolvePathRun(step, target, result, postOperation, log) {
        // called for wildcards and inversions
        const doStep = (subStep, target, results, post) => {
            let outcome = {
                matched: false,
                indexer: undefined,
                target: undefined,
                isSelect: true,

                // if true, the array's contents are the results; 
                // false then the array itself is the result
                isMultiResult: true
            };

            if (subStep.type === TokenTypes.key) {
                if (subStep.subType === TokenSubTypes.negativeKey) {
                    // return all items in the container that do not match the given key
                    const items = (() => {
                        const keys = typeof target === 'object' ?
                            Object.entries(target).map((set, index) => set[0]) :
                            (Array.isArray(target) ? target.keys() :
                                []);

                        return keys
                            .filter((k) => k !== subStep.content)
                            .map((k, i) => target[k]);
                    })();

                    outcome = {
                        matched: true,
                        indexer: undefined,
                        target: items,
                        isSelect: true,
                        isMultiResult: true
                    };
                }
            } else if (subStep.type === TokenTypes.any) {
                // matches anything, so just return and the items contents
                const keys = typeof target === 'object' ?
                    Object.entries(target).map((set, index) => set[0]) :
                    (Array.isArray(target) ? target.keys() :
                        []);

                outcome = {
                    matched: true,
                    indexer: undefined,
                    target: keys.map((k) => target[k]),
                    isSelect: true,
                    isMultiResult: true
                };
            } else if (subStep.type === TokenTypes.anyAtAll) {
                // this always matches *everything to any depth*
                // this means that we recursively iterate through the tree, 
                //      gather every path node in the structure, and return them as a flat list
                let allFound = [];
                const iterationRecursive = (subject, all) => {
                    // we want a list of all of the sub items, 
                    // e.g. everything under a property at any depth
                    all.push(subject);

                    const keys = typeof subject === 'object' ?
                        Object.entries(subject).map((set, index) => set[0]) :
                        (Array.isArray(subject) ? subject.keys() :
                            []);

                    keys.forEach((key, index) => {
                        // once this is done, we call the recursive against the subject's children (continuing the down the tree)
                        iterationRecursive(subject[key], all);
                    });

                    return all;
                }

                iterationRecursive(target, allFound);

                outcome = {
                    matched: true,
                    indexer: undefined,
                    target: allFound,
                    isSelect: true,
                    isMultiResult: true
                };
            } else if (subStep.type === TokenTypes.array) {
                // this always matches any array
                if (Array.isArray(target)) {
                    outcome = {
                        matched: true,
                        indexer: undefined,
                        target: target,
                        isSelect: true,
                        isMultiResult: true
                    };
                }
            }

            return outcome;
        }

        // called when a substep is a positive key (direct reference)
        const doKeyStep = (subStep, target, results, post) => {
            let outcome = {
                matched: false,
                target: [], // this contains all of the items found under this step's destination target[subStep.content]
            };

            if (subStep.type === TokenTypes.key) {
                if (subStep.subType === TokenSubTypes.positiveKey) {
                    const result = target[subStep.content];

                    outcome = {
                        matched: !!result,
                        target: result,
                        isMultiResult: false
                    };
                }
            }

            return outcome;
        }

        // correctly merges groups of results for an interpretation step
        const addResult = (current, addition, additionIsArray) => {
            if (!current) {
                return additionIsArray === true ? [addition] : addition;
            }

            let result = undefined;
            if (!!current && !!addition) {
                if (Array.isArray(current)) {
                    result = [...current];

                    if (Array.isArray(addition) && additionIsArray === true) {
                        result.push(addition);
                    } else {
                        if (Array.isArray(addition)) {
                            addition.forEach((item) => result.push(item));
                        } else {
                            result.push(addition);
                        }
                    }
                } else {
                    result = [current];

                    if (Array.isArray(addition) && additionIsArray === true) {
                        result.push(addition);
                    } else {
                        addition.forEach((item) => result.push(item));
                    }
                }
            }

            return result;
        }

        // a path run is a sequence of keys that, when resolved, navigate through the structure
        // executing a path run relocates the context to the point just past its end

        let workSets = [target];
        let currentResult = undefined;
        for (let i = 0; i < step.content.length; i++) {
            const subStep = step.content[i];
            currentResult = undefined;
            let resultingWork = []; // this is where the loop stores its work before moving it to workSets

            if (subStep.type === TokenTypes.separator) {
                // nothing to do, skip it unless this is the last iteration
                if (i < (step.content.length - 1)) {
                    continue;
                }
            } else {
                let responses = [];
                // each successive step in the pathrun further filters the previous step's items
                // so: 
                //      execute the evauation method against each item in the current step 
                //      and then overwrite them with the new set
                workSets.forEach((item, index) => {
                    let outcome;
                    if (subStep.subType === TokenSubTypes.function) {
                        outcome = this.#resolveFunction(subStep, item, responses, log);
                    } else if (subStep.type === TokenTypes.key && subStep.subType === TokenSubTypes.positiveKey) {
                        // if the substep is a specific name key then there is no need to check if we can,  
                        // just call it, and if we get something, then it worked.
                        outcome = doKeyStep(subStep, item, responses, postOperation);
                    } else {
                        outcome = doStep(subStep, item, responses, postOperation);
                    }

                    if (outcome.matched === true) {
                        if (Array.isArray(outcome.target) && outcome.isMultiResult === true) {
                            resultingWork = this.#merge(resultingWork, outcome.target);
                            currentResult = addResult(currentResult, outcome.target, outcome.isMultiResult === false);
                        } else {
                            resultingWork.push(outcome.target);
                            currentResult = addResult(currentResult, outcome.target, outcome.isMultiResult === false);
                        }
                    } else {
                        currentResult = undefined;
                    }
                });
            }

            if (resultingWork.length === 0) {
                // no matches.  we're done -- as a failure
                break;
            } else {
                // we aren't done processing the steps, 
                // overwrite workSets with resultingWork to give the next step its job details
                workSets = resultingWork;
            }
        }

        return {
            matched: !!currentResult,
            indexer: undefined,  // pathruns always hard resolve to a set of objects (even if its an array)
            target: currentResult,
            isSelect: true,
        };
    }

    /**
     * A function call is a key pointing to a property where a function is housed, 
     * optionally paired with an array of parameters for the function
     * Returns this format:
     *     { matched: <boolean>, [indexer: <function>], [target: <object>], [isSelect: <boolean>] }
     *         matched tells resolve if the test passed, if false we return nothing
     *         indexer is a function to generate a listing of targets to continue on, 
     *             this supercedes target and will only be present in specific situations 
     *             (like after resolving an array with a wildcard match)
     *         target is a hard target transition, if present it will supercede the target function parameter
     *         isSelect, if present,  will override default Select / non-Select behavior
     * @param {object} step The function call step to resolve
     * @param {object | Array} target The current contextual target within the queried structure
     * @param {Array} result The result array.  Populated by endpoint matches
     * @param {jobjesLog} log An optional log to post errors to
     * @returns An object of the form { matched: <boolean>, [indexer: <function>], [target: <object>], [isSelect: <boolean>] }
     */
    #resolveFunction(step, target, result, log) {
        let outcome = {
            matched: false,
            indexer: undefined,
            target: undefined, // this is the actual outcome of the operation
            isSelect: true
        };

        if (step.subType === TokenSubTypes.function) {
            if (step.content[0].type === TokenTypes.key) {
                // now, execute the key so we have whatever we should
                // (this allows wildcards to start function calls)

                // generate a pathrun around the desired key, so we can properly execute it
                const generatedPathRun = new JobjeSTokenizer({}).Tokenize(`${step.content[0].content}`, this.#targetDivider, this.#pathseparator)[0].content[0];
                const pathRunOutcome = this.#resolvePathRun(generatedPathRun, target, [], undefined, log);

                // only continue if it didn't fail
                if (log.count() === 0 && pathRunOutcome.matched === true) {
                    if (typeof pathRunOutcome.target === 'function') {
                        let funcResult;

                        try {
                            // execute the function
                            if (!!step.parameters) {
                                funcResult = pathRunOutcome.target(...step.parameters);
                            } else {
                                funcResult = pathRunOutcome.target();
                            }

                            outcome.matched = true;
                            outcome.target = funcResult;
                        } catch (err) {
                            // we don't care if the function dies on execution, only that it didn't match (because it failed)
                            // the outcome of the function is the exception
                            outcome.target = err;
                        }
                    } else if (Array.isArray(pathRunOutcome.target)) {
                        // if a query is somehow executed such that a list of functions is returned, 
                        // we will handle that
                        let funcResults = [];

                        pathRunOutcome.target.forEach((func, index) => {
                            if (typeof func === 'function') {
                                try {
                                    // execute the function
                                    if (!!step.parameters) {
                                        funcResults.push(func(...step.parameters));
                                    } else {
                                        funcResults.push(func());
                                    }

                                    outcome.matched = true;
                                    outcome.target = funcResults.length === 1 ? funcResults[0] : funcResults;
                                } catch (err) {
                                    // we don't care if the function dies on execution, only that it didn't match (because it failed)
                                    // the outcome of the function is the exception
                                    outcome.target = err;
                                }
                            } else {
                                funcResults.push({ reason: "Item was not a function", resultItem: func, resultIndex: index, functionKey: step.content[0].content });
                            }
                        });
                    } else {
                        this.#entry("Function key did not point to a function", step.content[0].index, {}, undefined, log);
                    }
                } else {
                    this.#entry("Function key did not match structure", step.content[0].index, {}, undefined, log);
                }
            } else {
                this.#entry("Functions must begin with a key", step.content[0].index, {}, undefined, log);
            }
        } else {
            this.#entry("Function expected", step.index, {}, undefined, log);
        }

        return outcome;
    }

    /**
     * A conversion resolves down to an array of objects or a singular object.  This statement updates the context.
     * @param {object} step The conversion step to resolve
     * @param {object | Array} target The current contextual target within the queried structure
     * @param {Array} result The result array.  Populated by endpoint matches
     * @param {jobjesLog} log An optional log to post errors to
     * @param {boolean} isPostOperationConvert If true, this method was called as a post operation for a query.  Otherwise, it is part of the query
     * @returns An object of the form { matched: <boolean>, [indexer: <function>], [target: <object>], [isSelect: <boolean>] }
     */
    #resolveConversion(step, target, result, log, isPostOperationConvert = false) {
        let outcome = {
            matched: false,
            indexer: undefined,
            target: undefined,
            isSelect: true
        }

        let generations = [];

        let errors = [];

        // a conversion plan is a listing of what must be done with every property on the object literal
        const buildConversionPlan = (conversions, inclusive, obj) => {
            let result = {
                actions: []
            }

            // operations are performed in the order delivered, this allows greater control for developers
            conversions.forEach((op) => {
                if (op.operation === TokenTypes.convertInclude ||
                    op.operation === TokenTypes.convertIfFound ||
                    op.operation === TokenTypes.convertIfNotFound) {
                    result.actions.push(op);
                } else if (op.operation === TokenTypes.convertBlock) {
                    result.actions.push(op);
                }
            });

            // if this is inclusive, then create an include for every unmensioned, root-level property
            // these are appended at the end
            if (inclusive === true) {
                const keys = typeof obj === 'object' ?
                    Object.entries(obj).map((set, index) => set[0]) :
                    (Array.isArray(obj) ? obj.keys() :
                        []);

                keys.forEach((property) => {
                    const match = result.actions.find((op) => {
                        // make sure this is an immediate path (1 element)
                        if (op?.source?.content?.length === 1) {
                            const work = op.source.content;

                            // that one element should be a pathrun with one item in it
                            if (work[0].type === TokenTypes.pathRun && work[0]?.content?.length === 1) {
                                const target = work[0]?.content[0];

                                // that one item should be a key
                                // and for this to match, that key should be our property
                                if (target.type === TokenTypes.key && target.content === property) {
                                    return true;
                                }
                            }
                        }

                        return false;
                    });

                    if (match === undefined) {
                        let includeOperation = new JobjeSTokenizer({}).Tokenize(`{+${property}>+>${property}}`, this.#targetDivider, this.#pathseparator)[0].content[0].content[0];

                        result.actions.push(includeOperation);
                    }
                });
            }

            return result;
        }

        // takes a given source and executes the conversions, generating a result object
        const convert = (source, plan) => {
            let conversionResult = undefined;

            /**
             * Takes a pathrun and builds it in conversionResult, creating conversion result if necessary
             * @param {object} destination Destination should be a pathrun
             * @returns nothing
             */
            const buildPath = (destination, resources) => {
                // iterate through the destination pathrun and build it in the result instance
                let current = conversionResult;

                // sets a value in a specific key in the correct target
                const updateResult = (key, value) => {
                    if (!!conversionResult) {
                        if (key in current) {
                            // if the key exists, only act if they differ (array -> object or visa versa)
                            if (Array.isArray(current[key]) && typeof value === 'object') {
                                current[key] = value;
                            } else if (typeof current[key] === 'object' && Array.isArray(value)) {
                                current[key] = value;
                            } else if (['string', 'number', 'undeclaredVariable', 'boolean'].includes(typeof current[key])) {
                                // this allows values to overwrite previously set cells
                                current[key] = value;
                            }

                            // no else, because that means we leave it alone
                        } else {
                            current[key] = value;
                        }
                        current = current[key];
                    } else {
                        conversionResult = {};
                        conversionResult[key] = value;
                        current = conversionResult[key];
                    }
                }

                for (let destinationStep = 0; destinationStep < destination.content.length; destinationStep++) {
                    // skip separators
                    if (destination.content[destinationStep].type === TokenTypes.separator) continue;
                    const part = destination.content[destinationStep];

                    if (part.type === TokenTypes.key) {
                        // get the next non-separator step
                        const nextPart = (() => {
                            let outcome = undefined;

                            for (let i = destinationStep + 1; i < destination.content.length; i++) {
                                if (destination.content[i].type !== TokenTypes.separator) {
                                    outcome = { step: destination.content[i], index: i };
                                    break;
                                }
                            }

                            return outcome;
                        })();

                        // if the next step is an array declaration, 
                        //      then make the content of the current key an array.
                        //      then eat the array declaration.
                        // otherwise, behave as normal (i.e. make it an object or, if this is the end, make it the provided value(s) in resources)
                        if (nextPart?.operation?.type === TokenTypes.array) {
                            destinationStep = nextPart.index;

                            // is this our last step?
                            if (destinationStep >= (destination.content.length - 1)) {
                                // yes
                                updateResult(part.content, [...resources]);
                            } else {
                                // no
                                updateResult(part.content, []);
                            }
                        } else {
                            // is this our last step?
                            if (destinationStep >= (destination.content.length - 1)) {
                                // yes
                                if (resources.length > 0) {
                                    updateResult(part.content, resources.length === 1 ? resources[0] : resources);
                                } else {
                                    //updateResult(part.content, undefined);
                                }
                            } else {
                                // no
                                updateResult(part.content, {});
                            }
                        }
                    } else {
                        // bad path
                        // terminate the loop
                        if (operation.required === true) {
                            errors.push({ step: step, substep: operation, reason: `Destination creation process failed.  Unable to process creation directive '${part.content}'.` });
                        }
                        return;
                    }
                }
            }

            /**
             * Executes a provided query against the proper source and returns the result
             * @param {object} query A query token instance to execute
             * @param {object} operation The conversion sub-operation the query comes from
             * @returns The result from the query
             */
            const executeQuery = (query, operation) => {
                // resolve the source
                let resources = [];
                let skipQueryExecution = false;
                const cacheKey = JSON.stringify(this.#stripSelfReferences(query));

                const sourceQueryTarget = (() => {
                    // for performance, we will cache the result of anchored conversion queries
                    //      this is because their results will not change, 
                    //      and they will be executed against each item in the list to be converted
                    if (operation.anchored === true) {
                        if (!!this.#anchorCache[cacheKey]) {
                            resources = this.#anchorCache[cacheKey];
                            skipQueryExecution = true;

                            return this.#anchor;
                        } else {
                            return source;    
                        }                                                
                    } else {
                        return source;
                    }
                })();

                if (skipQueryExecution === false) {
                    /* let keys;
                    if (query.content[0].type === TokenTypes.key) {
                        // derive the list of keys.  
                        // this is only necessary if a wildcard is used to start the source query
                        keys = [query.content[0].content[0].content];
                        if (query.content[0].content[0].type === TokenTypes.any) {
                            keys = typeof sourceQueryTarget === 'object' ?
                                Object.entries(sourceQueryTarget).map((set, index) => set[0]) :
                                (Array.isArray(sourceQueryTarget) ? sourceQueryTarget.keys() :
                                    []);
                        } else if (query.content[0].content[0].type === TokenTypes.array) {
                            if (Array.isArray(sourceQueryTarget)) {
                                keys = typeof sourceQueryTarget === 'object' ?
                                    Object.entries(sourceQueryTarget).map((set, index) => set[0]) :
                                    (Array.isArray(sourceQueryTarget) ? sourceQueryTarget.keys() :
                                        []);
                            } else {
                                keys = [];
                            }
                        } else if (query.content[0].content[0].type === TokenTypes.anyAtAll) {
                            keys = typeof sourceQueryTarget === 'object' ?
                                Object.entries(sourceQueryTarget).map((set, index) => set[0]) :
                                (Array.isArray(sourceQueryTarget) ? sourceQueryTarget.keys() :
                                    []);
                        }
                    } else {
                        keys = typeof sourceQueryTarget === 'object' ?
                            Object.entries(sourceQueryTarget).map((set, index) => set[0]) :
                            (Array.isArray(sourceQueryTarget) ? sourceQueryTarget.keys() :
                                []);
                    } */

                    /* keys.forEach((k) => {
                        this.#resolve(
                            query.content,
                            sourceQueryTarget,
                            k,
                            resources,
                            undefined,
                            errors,
                            query.postOperation);
                    }); */

                    this.#resolve(
                        query.content,
                        sourceQueryTarget,
                        resources,
                        query.postOperation,
                        new jobjesLog(errors));

                    // add the results to the cache
                    if (operation.anchored === true) {
                        this.#anchorCache[cacheKey] = resources;
                    }
                }

                return resources;
            }

            const doInclude = (operation) => {
                if (errors.length > 0) return;

                const resources = executeQuery(operation.source, operation);

                // ensure that the destination exists and put the resources there
                if (errors.length === 0) {
                    buildPath(operation.destination, resources);
                } else {
                    if (operation.required === true) {
                        errors.push({ step: step, substep: operation, reason: 'Source query provided returned errors', errors: [...errors] });
                    }
                    return;
                }
            }

            const doBlock = (operation) => {
                // take the denial and execute it as a query against the target, omitting the final query step,
                // this will give the container of the target property
                // then check for the target property
                //      if it exists, delete it
                //      if it does not, the denial fails

                let denialLog = [];

                // count back from the end of the pathrun (starting one shy of the end) until we find a non-separator key
                const cutoffIndex = (() => {
                    let indexResult = operation.source.content.length - 2;
                    for (let cI = operation.source.content.length - 2; cI > 0; cI--) {
                        const targetToken = operation.source.content[cI];
                        if ([TokenTypes.separator].includes(targetToken.type) === false) {
                            indexResult = operation.source.content.length + cI;
                            break;
                        }
                    }

                    return indexResult;
                })();

                // create a pathrun that stops at the cutoff point
                const deletePath = {
                    ...operation.source,
                    content: operation.source.content.slice(0, cutoffIndex)
                }
                const finalPiece = operation.source.content.length > 0 ? operation.source.content[operation.source.content.length - 1] : undefined;
                if ([TokenTypes.any, TokenTypes.anyAtAll, TokenTypes.array].includes(finalPiece.type) === false) {
                    // retrieve the path to deny
                    let denialTargetQueryOutcome;

                    // if we have a query to run, then run it
                    if (deletePath.content.length > 0) {
                        denialTargetQueryOutcome = this.#resolvePathRun(
                            deletePath,
                            conversionResult,
                            [],
                            undefined,
                            new jobjesLog(denialLog));
                    } else {
                        if (!!finalPiece) {
                            // if we have no query, then finalPiece should have a key in it.
                            // that means that the conversion result is the query result 
                            //      (#find won't return anything on an empty query)
                            denialTargetQueryOutcome = {
                                matched: true,
                                indexer: undefined,
                                target: [conversionResult],
                                isSelect: true,
                            }
                        } else {
                            errors.push({ step: step, substep: operation, reason: 'No valid pathrun target provided to block.' });
                        }
                    }

                    // now, iterate through the denial target query's results and 
                    // attempt to delete the last item in the query from them
                    let denialSucceeded = true;
                    denialTargetQueryOutcome.target.forEach((item) => {
                        if (!!item[finalPiece.content]) {
                            delete item[finalPiece.content];

                            denialSucceeded = denialSucceeded && true;
                        } else {
                            denialSucceeded = false;
                        }
                    });

                    if (operation.required && denialSucceeded === false) {
                        errors.push({ step: step, substep: operation, reason: 'Denial conversion action failed.  Required action could not find path.' });
                    }
                } else {
                    errors.push({ step: step, substep: operation, reason: 'The denial conversion target path must end with a specific key, not a wildcard.' });
                }

                if (operation.required && denialLog.length > 0) {
                    errors.push({ step: step, substep: operation, reason: 'Denial source pathrun returned errors', errors: [...denialLog] });
                }
            }

            const doFound = (operation, ifYes) => {
                // "if not found"s follow this format: [query]!>[query] or [value],[pathrun]
                // the above reads as 
                //      "if (the inquisition query) does not exist then take (value query/value) and put it here (destination pathrun)"
                const checkFoundState = (foundCount, wantFound) => {
                    let outcome = undefined;
                    if (wantFound === true) {
                        outcome = foundCount > 0;
                    } else {
                        outcome = foundCount === 0;
                    }

                    return outcome;
                }

                const resources = executeQuery(operation.inquisition, operation);
                if (errors.length === 0) {
                    if (checkFoundState(resources.length, ifYes)) {
                        // get the value to insert
                        let insert = undefined;
                        if (operation.value.type === TokenTypes.subquery) {
                            insert = executeQuery(operation.value, operation);
                            if (insert.length === 1) {
                                insert = insert[0];
                            } else if (insert.length > 1) {
                                // explicitly leave it alone, because the array is the content
                            } else {
                                insert = undefined;
                            }
                        } else {
                            insert = operation.value.content;
                        }

                        // now that we have a value to place, build the location and put it there
                        if (errors.length === 0) {
                            buildPath(operation.destination, insert);
                        } else {
                            if (operation.required === true) {
                                errors.push({ step: step, substep: operation, reason: 'Value query provided returned errors', errors: [...errors] });
                            }
                            return;
                        }
                    } else {
                        if (operation.required === true) {
                            errors.push({ step: step, substep: operation, reason: 'Inquisition query provided returned items' });
                        }
                        return;
                    }
                } else {
                    if (operation.required === true) {
                        errors.push({ step: step, substep: operation, reason: 'Inquisition query provided returned errors', errors: [...errors] });
                    }
                    return;
                }
            }

            if (typeof source === 'object') {
                // iterate through operations and handle them as they come
                plan.actions.forEach((operation, index) => {
                    switch (operation.operation) {
                        case TokenTypes.convertInclude:
                            doInclude(operation, source, index);
                            break;
                        case TokenTypes.convertBlock:
                            doBlock(operation, source, index);
                            break;
                        case TokenTypes.convertIfFound:
                            doFound(operation, true);
                            break;
                        case TokenTypes.convertIfNotFound:
                            doFound(operation, false);
                            break;
                    }
                });
            } else {
                // failure is silent because conversion will encounter things it cannot convert.  
                // it would likely never succeed if it failed with a shout every time
                return undefined;
            }

            if (errors.length === 0) {
                return conversionResult;
            } else {
                return;
            }
        }

        const topic = target;
        if (!!topic) {
            if (Array.isArray(topic) || typeof topic === 'object') {
                const plan = buildConversionPlan(step.content, step.inclusive, topic);
                let conversionResult = convert(topic, plan);

                if (!!conversionResult) {
                    generations.push(conversionResult);
                }
            } else {
                log.logError(`Cannot convert value '${topic}'`, {}, step.index);
            }
        }

        outcome.matched = errors.length === 0 && generations.length > 0;
        if (outcome.matched === true) {
            if (isPostOperationConvert === true) {
                generations.forEach((item) => result.push(item));
            }

            // generate work items for every property in every match
            let work = [];
            generations.forEach((item) => {
                const k = "convertResult";
                let instance = {};
                instance[k] = item;

                work.push({
                    key: k,
                    current: instance
                });
            });
            outcome.matches = work;
        }

        this.#tracker.explore(generations);
        outcome.target = generations;
        return outcome;
    }

    /**
     * An external function is a call to a function external to the in-built functionality of the JobjeS system.
     * Returns this format:
     *     { matched: <boolean>, [indexer: <function>], [target: <object>], [isSelect: <boolean>] }
     *         matched tells resolve if the test passed, if false we return nothing
     *         indexer is a function to generate a listing of targets to continue on, 
     *             this supercedes target and will only be present in specific situations 
     *             (like after resolving an array with a wildcard match)
     *         target is a hard target transition, if present it will supercede the target function parameter
     *         isSelect, if present,  will override default Select / non-Select behavior
     * @param {object} step The function call step to resolve
     * @param {object | Array} target The current contextual target within the queried structure
     * @param {Array} result The result array.  Populated by endpoint matches
     * @param {jobjesLog} log An optional log to post errors to
     * @returns An object of the form { matched: <boolean>, [indexer: <function>], [target: <object>], [isSelect: <boolean>] }
     */
    #resolveExternal(step, target, result, log) {
        let outcome = {
            matched: false,
            indexer: undefined,
            target: undefined,
            isSelect: true
        };

        if (step.type === TokenTypes.external) {
            const external = this.constructor.#externals.filter((func) => func.name === step.name);
            if (external.length === 1) {
                try {
                    const funcResult = external[0].func(
                        target,
                        this.#tracker,
                        ...step.parameters.map((parameterItem) => {
                            if (parameterItem.type === TokenTypes.parameterItem) {
                                return parameterItem.parameter;
                            } else {
                                //const matchAnyNonSelect = new JobjeSTokenizer({}).Tokenize('(*).', this.#targetDivider, this.#pathseparator)[0];

                                let queryResult = [];
                                let queryLog = [];
                                //const externalParameterQuery = [...matchAnyNonSelect.content, ...parameterItem.content];
                                const externalParameterQuery = parameterItem.content;
                                this.#resolve(externalParameterQuery, target, queryResult, parameterItem.postOperation, queryLog);

                                return queryResult.length === 1 ? queryResult[0] : queryResult;
                            }
                        }));

                    outcome.matched = true;
                    outcome.target = funcResult;
                } catch (ex) {
                    log.push({ 'step': key, 'reason': `External evocation '${step.name}' threw exception.`, exception: ex });
                }
            } else {
                log.push({ 'step': key, 'reason': `No such intrinic function is defined: '${step.name}'.` });
            }
        } else {
            log.push({ 'step': key, 'reason': `Expected external evocation.  Got '${step}'` });
        }

        return outcome;
    }

    /**
     * Checks to see if the given query matches the given structure.  Returns a boolean value indicating if any match was found.
     * 
     * @param {String} query The query string to execute against the subject
     * @param {Array | object} subject An object or array to query
     */
    match(query, subject) {
        return this.#find(query, subject)?.length > 0;
    }

    /**
     * Calls a callback fuction against each match and returns all matches upon completion.
     * 
     * @param {String} query The query string to execute against the subject
     * @param {Array | object} subject An object or array to query
     * @param {function} callback The function to call.  Of the form (item) => {}
     */
    with(query, subject) {
        const results = this.#find(query, subject);
        results.forEach(callback);

        return results;
    }

    /**
     * Executes the query provided in query string against the subject item and returns the resulting matches.
     * 
     * @param {String} query The query string to execute against the subject
     * @param {Array | object} subject An object or array to query
     *  
     * returns the result
     */
    where(query, subject) {
        return this.#find(query, subject);
    }

    /**
     * Executes the provided query string against the subject and places the item at all matching locations.
     * 
     * @param {String} target The query indicating where to place the item.  Multiple matches will result in the item getting placed in all indicated locations.
     * @param {Array | object} subject The object to execute the query against
     * @param {any} item The object to insert into the subject
     * @param {String | Number} key On objects, this is the property name to insert the item under.  For arrays, it should be the index.
     * 
     * returns the result (post modifications)
     */
    insert(target, subject, item, key, parameterDictionary) {
        outcome = this.#find(target, subject);

        for (let i = 0; i < outcome.length; i++) {
            outcome[i][key] = item;
        }

        return outcome;
    }
}