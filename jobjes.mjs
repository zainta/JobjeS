import { relationshipTypes, JobjeSHierarchyMonitor } from './jobjesHierarchyMonitor.mjs';
import { JobjeSTokenizer, TokenSubTypes, TokenTypes } from './jobjesTokenizer.mjs';
import { duplicate, isRegex } from './jobjesUtility.mjs';

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
 *      || : Ensures that at least one of the conditions / parentheticals in the chain evaluate as true.
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
 */
export default class JobjeS {
    static #targetDivider = ':';
    static #pathseparator = '.';
    static #defaultLog = [];
    static #anchor = undefined; // this is a reference to the root of the structure the query is running against
    static #monitor = undefined; // used to track the queried object's hierarchy

    /**
     * Updates the text used to differentiate the halves of a condition definition.  These characters must be unique within the path, as an unintelligent split is performed against them.
     * 
     * @param {String} divider The divider is the character(s) that represent the border between the two halves of a Condition definition
     */
    static setDivider(divider) {
        if (!!divider && typeof divider === 'string') {
            JobjeS.#targetDivider = divider;
        }
    }

    /**
     * Updates the text used to seperate the parts of the query path.  These characters must be unique within the path, as an unintelligent split is performed against them.
     * 
     * @param {String} separator The separator is the character(s) that represent the border between components in a query path
     */
    static setseparator(separator) {
        if (!!separator && typeof separator === 'string') {
            JobjeS.#pathseparator = separator;
        }
    }

    /**
     * Gets the default log array resulting from the last execution.
     * @returns The default log array
     */
    static getLog() {
        return this.#defaultLog;
    }

    static #post(item, set, onEachFound) {
        if (this.#contains(set, item) === false) {
            set.push(item);
            if (!!onEachFound && typeof onEachFound === 'function') onEachFound(item);
        }
    }

    // check if an item is contained within an array 
    // in a manner that catches non-instance based duplicates
    static #contains(arr, itm) {
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

    // merge two arrays without duplicates
    static #merge(set1, set2) {
        // make a stringified version of each

        // note, this will lose functions if they are included, 
        // so just merging them isn't possible
        let str1 = set1.map((item) => JSON.stringify(item));
        let str2 = set2.map((item) => JSON.stringify(item));

        // instead, iterate through the first one, checking if the second one includes its items
        // add the ones that aren't duplicated while tracking the ones that are
        let outcome = [];
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

        return outcome;

        /* return set1.concat(set2); */
    }

    static #allKeys(subject) {
        const keys = typeof subject === 'object' ?
            Object.entries(subject).map((set, index) => set[0]) :
            (Array.isArray(subject) ? subject.keys() :
                []);
    }

    /**
     * Executes a query against the subject and then calls the provided callback against each match.  Returns the set of matches.
     * 
     * @param {String} query The query to execute
     * @param {Array | object} subject The object to execute it against (an object or array)
     * @param {function} onEachFound This callback will be executed against each match found within the structure
     * @param {Array} externalLog The caller can provide an external call log to populate.  Otherwise, the log is discarded.
     * @param {object} parameterDictionary A dictionary of key->parameter array sets for use with any function calls
     * 
     * Returns an array containing all matches
     */
    static #find(query, subject, onEachFound, externalLog, parameterDictionary) {
        if (typeof query !== 'string') return [];
        if (typeof subject !== 'object' && !Array.isArray(subject)) return [];

        const tokenizer = new JobjeSTokenizer(parameterDictionary);
        const tokens = tokenizer.Tokenize(query, JobjeS.#targetDivider, JobjeS.#pathseparator);
        if (tokens.length === 0)
            return [];

        let completeResult = [];
        this.#defaultLog = !!externalLog ? externalLog : [];
        this.#anchor = subject;

        if (tokenizer.error() === true) {
            this.#defaultLog = [...this.#defaultLog, ...tokenizer.log()];
            return [];
        }

        this.#monitor = new JobjeSHierarchyMonitor(true);
        this.#monitor.add(subject);

        // begin by deriving an array of keys from the subject.
        // These will be the indices in the case of an array.
        const keys = typeof subject === 'object' ?
            Object.entries(subject).map((set, index) => set[0]) :
            (Array.isArray(subject) ? subject.keys() :
                []);

        // tokens will contain a list of subqueries
        // this could be only one, but it could be huge, too
        // loop through them, giving them each their own result array, until done
        tokens.forEach((sequence, index) => {
            let result = [];
            keys.forEach((key, index) => {
                this.#resolve(duplicate(sequence.content), subject, key, result, !!sequence.conversion ? undefined : onEachFound, this.#defaultLog, sequence.postOperation);
            });

            // before we sequence, we have to check if the subquery needs to be converted
            if (!!sequence.conversion) {
                let conversionResult = [];
                this.#resolveConversion(sequence.conversion, { convert: result }, "convert", conversionResult, onEachFound, this.#defaultLog, true);
                result = conversionResult;
            }

            if (!!sequence.sequencer) {
                switch (sequence.sequencer.type) {
                    case TokenTypes.sequence: // one after another
                        completeResult.push(result);
                        break;
                    case TokenTypes.mergeSequence: // combine with the previous
                        const last = completeResult.splice(completeResult.length - 1, 1);
                        // only way this should ever fail is if, somehow, there is a merge on the first sequence 
                        // (which will be error-lessly ignored)
                        if (last.length === 1) {
                            completeResult.push(last.concat(result));
                        } else {
                            completeResult.push(result);
                        }
                        break;
                }
            } else {
                completeResult.push(result);
            }
        });

        if (completeResult.length === 1) {
            return completeResult[0];
        } else {
            return completeResult;
        }
    }

    /**
     * Resolves the given series of query steps and returns the resolution
     * @param {object} querySteps The current query to resolve
     * @param {object | Array} container The current container within the queried structure
     * @param {String} key The key for comparison to continue the query
     * @param {Array} result The result array.  Populated by endpoint matches
     * @param {function} onEachFound This callback will be executed against each match found within the structure. Single parameter: the object found
     * @param {Array} log The operational log
     * @param {object} postOperation the post operation to perform, if any
     * @returns An object of the form { matched: Boolean, container: *new focus* } 
     */
    static #resolve(querySteps, container, key, result, onEachFound, log, postOperation) {
        let outcome;

        // a select operation traverses the structure while non-selects do not.
        // the only non-select operation is a root level full condition

        // separators are metadata, and are discarded
        const step = querySteps[0].type === TokenTypes.separator ? querySteps[1] : querySteps[0];

        // this is the index of the last step that was executed this pass
        let stepIndex = querySteps.indexOf(step);

        switch (step.type) {
            case TokenTypes.condition:
            case TokenTypes.parenthetical:
                // because parentheticals and conditions can appear in series and freely mixed, 
                // when they are sequential, because they are not nested, 
                // it is important to consume the entire run of them since the result is dependant on the entire run
                let nextStep = step;
                while (nextStep.type === TokenTypes.parenthetical || nextStep.type === TokenTypes.condition) {
                    if (nextStep.type === TokenTypes.parenthetical) {
                        outcome = this.#resolveParenthetical(nextStep, container, key, result, onEachFound, log);
                    } else if (nextStep.type === TokenTypes.condition) {
                        outcome = this.#resolveCondition(nextStep, container, key, result, onEachFound, log);
                    }

                    // after a parenthetical or condition, we have to check if the next item is another of either.
                    // if it is, 
                    //      then we have to paste the previous step's outcome onto it 
                    //      so it has the value required by any operators that may be present
                    const checkedStep = querySteps.length > querySteps.indexOf(nextStep) + 1 ?
                        querySteps[querySteps.indexOf(nextStep) + 1] :
                        undefined;

                    if (!!checkedStep &&
                        (
                            (checkedStep.type === TokenTypes.condition && checkedStep.subType === TokenSubTypes.nestedCondition) ||
                            (checkedStep.type === TokenTypes.parenthetical)
                        ) &&
                        checkedStep.precedingOperator !== undefined) {
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
                outcome = this.#resolvePathRun(step, container, key, result, onEachFound, log, postOperation);
                break;
            case TokenTypes.conversion:
                outcome = this.#resolveConversion(step, container, key, result, onEachFound, log);
                break;
            case TokenTypes.key:
                if (step.subType === TokenSubTypes.function) {
                    outcome = this.#resolveFunction(step, container, key, result, onEachFound, log);
                } else {
                    log.push({ 'step': key, 'reason': `Unknown key sub type. ${JSON.stringify(step)}` });
                }
                break;
        }

        // now that we know that it matches or doesn't, we have to determine what to do
        if (outcome.matched) {
            // is there more query to process?
            if (stepIndex + 1 < querySteps.length) {
                // conditions *can't* act as selects.  everything else *can*. 
                // parentheticals being a maybe based on what's in them.
                if (outcome.isSelect === false) {
                    // when a non-select executes, if it passes, then the next step is executed against the same container, 
                    //      but against each of its contained keys.
                    // this is done to determine where to go next, and in case additional conditions are added to check further paths.
                    const keys = typeof container === 'object' ?
                        Object.entries(container).map((set, index) => set[0]) :
                        (Array.isArray(container) ? container.keys() :
                            []);

                    // meaning that non-selects grant permission to continue, by filtering out those who don't pass
                    for (let i = 0; i < keys.length; i++) {
                        this.#resolve(
                            querySteps.slice(stepIndex + 1),
                            container,
                            keys[i],
                            result,
                            onEachFound,
                            log);
                    }
                } else {
                    // loop through the work 
                    //      check to see if the new context target (outcome.matches[i].current) supports further processing
                    //      (i.e. is an object or array)
                    //      if yes, then continue, otherwise, the query deadends on that branch

                    // doing it this way allows each step to progress the context in very odd ways that weren't possible before
                    // this is good.

                    for (let i = 0; i < outcome.matches.length; i++) {
                        if (Array.isArray(outcome.matches[i].current) || typeof outcome.matches[i].current === 'object') {
                            this.#resolve(
                                querySteps.slice(stepIndex + 1),
                                outcome.matches[i].current,
                                outcome.matches[i].key,
                                result,
                                onEachFound,
                                log,
                                postOperation);
                        }

                        // note that resolve doesn't actually ever return anything.
                    }
                    // no else here because we have more query, but don't have more targets.
                    // that means our query doesn't match.
                }
            } else {
                // this is the end of our search, and our target
                if (postOperation?.objectize === true && !!outcome.container) {
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
                } else {
                    if (outcome.isSelect !== false || outcome.type === 'nested') {
                        for (let i = 0; i < outcome.matches.length; i++) {
                            this.#post(outcome.matches[i].current[outcome.matches[i].key], result, onEachFound);
                        }
                    } else {
                        this.#post(container, result, onEachFound);
                    }
                }
            }
        }
    }

    /**
     * Parentheticals resolve down to either a set of container keys for further evaluation or 
     * a boolean value indicating a conditional match
     * @param {object} step The parenthetical step to resolve
     * @param {object | Array} container The current container within the queried structure
     * @param {String} key The key for comparison to continue the query
     * @param {Array} result The result array.  Populated by endpoint matches
     * @param {function} onEachFound This callback will be executed against each match found within the structure. Single parameter: the object found
     * @param {Array} log The operational log
     * @returns An object of the form { matched: Boolean, container: *new focus* } 
     */
    static #resolveParenthetical(step, container, key, result, onEachFound, log) {
        // was the operation a select or a condition
        // a select is anything that points to a specific path explicitly by key
        // a condition is anything that examines the contents of the path, using the : notation (i.e. test:exactly)

        // the keys (in container) that will be further processed, according to matching conditions
        // this defaults to running against the sub-key provided (which is what a condition that matches will do)
        let furtherKeys = [key];
        let findings = [];

        this.#resolve(step.content, container, key, findings, onEachFound, log);

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
            matches: findings,
            isSelect: false
        };
    }

    /**
     * Conditions resolve down to a boolean value indicating a match state
     * @param {object} step The condition step to resolve
     * @param {object | Array} container The current container within the queried structure
     * @param {String} key The key for comparison to continue the query
     * @param {Array} result The result array.  Populated by endpoint matches
     * @param {function} onEachFound This callback will be executed against each match found within the structure. Single parameter: the object found
     * @param {Array} log The operational log
     * @returns An object of the form { matched: Boolean, container: *new focus* } 
     */
    static #resolveCondition(step, container, key, result, onEachFound, log) {
        const executeCondition = (condition, container, key, previousOutcome) => {
            let outcome = false;
            if (condition.type === TokenTypes.parenthetical) {
                outcome = this.#resolveParenthetical(condition, container, key, result, onEachFound, log)?.matched;
            } else if (condition.type !== TokenTypes.condition) {
                log.push({ 'step': key, 'reason': `Bad condition. ${JSON.stringify(condition)}` });
            } else {
                if (key in container) {
                    // the rule is the condition criteria
                    const rule = condition.content[0];

                    // check the step against the value under key
                    switch (rule.type) {
                        case TokenTypes.positiveValue:
                            // a positive value check means that we expect the given key to have the given value
                            outcome = container[key] === rule.content;
                            break;
                        case TokenTypes.negativeValue:
                            // a negative value check means that we expect the given key to not have the given value
                            outcome = container[key] !== rule.content;
                            break;
                        case TokenTypes.exists:
                            // an exists check checks to see if the given key exists on the given container
                            outcome = (key in container) === true;
                            break;
                        case TokenTypes.notexists:
                            // a not exists check checks to see if the given key does not exist on the given container
                            outcome = (key in container) === false;
                            break;
                        case TokenTypes.regex:
                            // a regex check :
                            //      applies the regular expression against the value within the given container 
                            //      under the given key and returns if it matches

                            if (isRegex(rule.content)) {
                                const re = new RegExp(rule.content);
                                if (typeof container[key] === 'string') {
                                    outcome = container[key]?.match(re)?.length > 0;
                                } else {
                                    outcome = JSON.stringify(container[key])?.match(re)?.length > 0;
                                }
                            } else {
                                log.push({ 'step': key, 'reason': `Regex condition did not contain valid regex. ${JSON.stringify(condition)}` });
                            }
                            break;
                        default:
                            log.push({ 'step': key, 'reason': `Unknown condition type. ${JSON.stringify(condition)}` });
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

        const executeNestedCondition = (condition, operator, container, key, previousOutcome) => {
            let outcome = false;
            if (key in container) {
                // the rule is the condition criteria
                const rule = condition;

                // check the step against the value under key
                switch (rule.type) {
                    case TokenTypes.positiveValue:
                        // a positive value check means that we expect the given key to have the given value
                        outcome = container[key] === rule.content;
                        break;
                    case TokenTypes.negativeValue:
                        // a negative value check means that we expect the given key to not have the given value
                        outcome = container[key] !== rule.content;
                        break;
                    case TokenTypes.exists:
                        // an exists check checks to see if the given key exists on the given container
                        outcome = (key in container) === true;
                        break;
                    case TokenTypes.notexists:
                        // a not exists check checks to see if the given key does not exist on the given container
                        outcome = (key in container) === false;
                        break;
                    case TokenTypes.regex:
                        // a regex check :
                        //      applies the regular expression against the value within the given container 
                        //      under the given key and returns if it matches

                        if (isRegex(rule.content)) {
                            const re = new RegExp(rule.content);
                            if (typeof container[key] === 'string') {
                                outcome = container[key]?.match(re)?.length > 0;
                            } else {
                                outcome = JSON.stringify(container[key])?.match(re)?.length > 0;
                            }
                        } else {
                            log.push({ 'step': key, 'reason': `Regex condition did not contain valid regex. ${JSON.stringify(condition)}` });
                        }
                        break;
                    default:
                        log.push({ 'step': key, 'reason': `Unknown condition type. ${JSON.stringify(condition)}` });
                        break;
                }
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

        const executeFunctionCondition = (func, condition, container, key, previousOutcome) => {
            let outcome = false;

            // step 1, confirm and execute the function.
            if (!!func) {
                const funcOutcome = this.#resolveFunction(func, container, key, [], undefined, []);

                // remember:
                // we don't care if the function fails, 
                // only that the outcome we *do* get from the function matches the condition
                // that means we must get something in the matches array
                if (!!funcOutcome.result) {
                    const funcContainer = funcOutcome.result;
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
                                log.push({ 'step': key, 'reason': `Regex condition did not contain valid regex. ${JSON.stringify(condition)}` });
                            }
                            break;
                        default:
                            log.push({ 'step': key, 'reason': `Unknown condition type. ${JSON.stringify(condition)}` });
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

        // at the end of this operation, 
        // this array should contain the containers matched by this operation (e.g. and sub operations) 
        // and the keys in them that should be further processed
        let furtherKeys = [key];

        if (step.subType === TokenSubTypes.fullCondition) {
            // full conditions do not advance
            // they include the relevant testing key

            // step 1, get the key
            if (step.content[0].type === TokenTypes.key) {
                const conditionKey = step.content[0].subType === TokenSubTypes.function ?
                    step.content[0].content[0].content :
                    step.content[0].content;

                // confirm that that token key matches the expected
                if (conditionKey === key) {

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
                                        container,
                                        conditionKey,
                                        lastOutcome.length === 1 ? lastOutcome[0] : undefined));
                            } else {
                                conditionResults.push(
                                    executeCondition(
                                        step.content[i],
                                        container,
                                        conditionKey,
                                        lastOutcome.length === 1 ? lastOutcome[0] : undefined));
                            }
                        }

                        const lastOutcome = conditionResults.slice(conditionResults.length - 1);
                        // the only outcome we care about is the final one.
                        outcome = {
                            matched: lastOutcome.length === 1 ? lastOutcome[0] : false,
                            matches: [{ key: key, current: container }],
                            isSelect: step.content[1].type === TokenTypes.filter, // the only difference between a filter and a normal full condition is that filters act as selects
                            type: 'full'
                        };
                    } else {
                        log.push({ 'step': key, 'reason': `Malformed full condition: divider (default ':') expected as second token. ${JSON.stringify(step)}` });
                    }
                } else {
                    // failures means no match
                    outcome = {
                        matched: false,
                        matches: [],
                        isSelect: false
                    }
                }
            } else {
                log.push({ 'step': key, 'reason': `Malformed full condition: key expected as first token. ${JSON.stringify(step)}` });
            }
        } else if (step.subType === TokenSubTypes.nestedCondition) {
            // nested conditions don't advance, either
            // they test against the container / key set their are given as parameters (execution context)

            let conditionResults = !!step.precedingOutcome ? [step.precedingOutcome] : [];
            // in a nested condition, everything should be conditions, 
            // so loop through them and perform the logical operations
            for (let i = 0; i < step.content.length; i++) {
                const lastOutcome = conditionResults.slice(conditionResults.length - 1);
                conditionResults.push(
                    executeNestedCondition(
                        step.content[i],
                        step.precedingOperator,
                        container,
                        key,
                        lastOutcome.length === 1 ? lastOutcome[0] : undefined));
            }

            const lastOutcome = conditionResults.slice(conditionResults.length - 1);
            // the only outcome we care about is the final one.
            outcome = {
                matched: lastOutcome.length === 1 ? lastOutcome[0] : false,
                matches: [{ key: key, current: container }],
                isSelect: false,
                type: 'nested'
            };
        } else {
            log.push({ 'step': key, 'reason': `Bad condition sub type. ${JSON.stringify(step)}` });
        }

        return outcome;
    }

    /**
     * A path run resolves down to a set of container keys for further evaluation
     * @param {object} step The path run step to resolve
     * @param {object | Array} container The current container within the queried structure
     * @param {String} key The key for comparison to continue the query
     * @param {Array} result The result array.  Populated by endpoint matches
     * @param {function} onEachFound This callback will be executed against each match found within the structure. Single parameter: the object found
     * @param {Array} log The operational log
     * @param {object} postOperation the post operation to perform, if any
     * @param {boolean} isRemovalQuery if true, returned matches are container and required deletion properties
     * @returns An object of the form { matched: Boolean, container: *new focus* } 
     */
    static #resolvePathRun(step, container, key, result, onEachFound, log, postOperation, isRemovalQuery) {
        const doStep = (subStep, target, key, results, onEachFound, log, post) => {
            // returns the item to put in the outcome.container property
            const getProperContainer = (container, key, post) => {
                let result = undefined;
                const mark = container[key];

                if (post?.objectize === true) {
                    // if we are objectizing, 
                    //      and we have only arrays, return the mark
                    //      ''  we have only objects, return the mark
                    //      ''  if mark isn't an array, but container is, then return container
                    //      ''  otherwise return container
                    if (!!mark) {
                        if (Array.isArray(mark)) {
                            if (Array.isArray(container)) {
                                result = mark;
                            } else {
                                result = container;
                            }
                        } else if (typeof mark === 'object') {
                            result = mark;
                        } else {
                            result = container;
                        }
                    } else {
                        // if there is no mark then the pathrun fails, 
                        // so we return nothing technically, but actually return the container
                        result = container;
                    }
                } else if (post?.enumerate === true) {
                    // if we are enumerating,
                    //      and we have only arrays, return the mark
                    //      ''  we have only objects, return the mark's properties as an array
                    //      ''  if mark is an array, return it
                    //      ''  if mark isn't an array, but container is, return container
                    //      ''  otherwise, return mark's enumerated properties
                    if (!!mark) {
                        if (Array.isArray(mark)) {
                            result = mark;
                        } else if (Array.isArray(container) && Array.isArray(mark) === false) {
                            result = container;
                        } else if (typeof mark === 'object') {
                            result = Object.entries(mark).map((set) => set[1]);
                        } else {
                            result = Object.entries(mark).map((set) => set[1]);
                        }
                    } else {
                        // if there is no mark then the pathrun fails, 
                        // so we return nothing technically, but actually return the container
                        result = container;
                    }
                } else {
                    // do nothing because this property isn't used normally
                }

                return result;
            }

            let outcome = {
                matched: false,
                container: undefined,
                keys: [],
                work: []
            };

            // used by array handles (*, **, and @) to generate their container property content
            const postOperationContainer = (() => {
                if (postOperation?.objectize === true) {
                    // return the entire array, so we get the objects inside
                    return target;
                } else {
                    // default behavior can handle this
                    return undefined;
                }
            })();

            if (subStep.type === TokenTypes.key) {
                if (subStep.subType === TokenSubTypes.positiveKey) {
                    if ((subStep.content in target) === true && subStep.content === key) {
                        const nextKeys = typeof target[key] === 'object' ?
                            Object.entries(target[key]).map((set, index) => set[0]) :
                            (Array.isArray(target[key]) ? target[key].keys() :
                                []);

                        const work = nextKeys.length === 0 ?
                            [{ key: key, current: target }] :
                            nextKeys.map((k, i) => {
                                return { key: k, current: target[key] }
                            });

                        outcome = {
                            matched: true,
                            keys: nextKeys,
                            container: getProperContainer(target, key, post),
                            work: work
                        };
                    }
                } else if (subStep.subType === TokenSubTypes.negativeKey) {
                    if ((subStep.content in target) === false && subStep.content === key) {
                        const nextKeys = (() => {
                            // return all items in the container that do not match the given key
                            const keys = typeof target[key] === 'object' ?
                                Object.entries(target[key]).map((set, index) => set[0]) :
                                (Array.isArray(target[key]) ? target[key].keys() :
                                    []);

                            let matches = [];
                            keys.forEach((k, i) => {
                                if (k !== subStep.content) {
                                    matches.push(k);
                                }
                            });

                            return matches;
                        })();

                        const work = nextKeys.length === 0 ?
                            [{ key: key, current: target }] :
                            nextKeys.map((k, i) => {
                                return { key: k, current: target[key] }
                            });

                        outcome = {
                            matched: true,
                            keys: nextKeys,
                            container: getProperContainer(target, key, post),
                            work: work
                        };
                    }
                }
            } else if (subStep.type === TokenTypes.any) {
                //const resolvedTarget = key === TokenTypes.any ?

                // this always matches, so get all of the keys and continue on each
                const nextKeys = typeof target[key] === 'object' ?
                    Object.entries(target[key]).map((set, index) => set[0]) :
                    (Array.isArray(target[key]) ? target[key].keys() :
                        []);

                const work = nextKeys.length === 0 ?
                    [{ key: key, current: target }] :
                    nextKeys.map((k, i) => {
                        return { key: k, current: target[key] }
                    });

                outcome = {
                    matched: true,
                    keys: nextKeys,
                    container: postOperationContainer,
                    work: work
                };
            } else if (subStep.type === TokenTypes.anyAtAll) {
                // this always matches *everything to any depth*
                // this means that we recursively iterate through the tree, 
                //      gather every path node in the structure, and return them as a flat list
                let allFound = [];
                const iterationRecursive = (subject, all) => {
                    const keys = typeof subject === 'object' ?
                        Object.entries(subject).map((set, index) => set[0]) :
                        (Array.isArray(subject) ? subject.keys() :
                            []);

                    keys.forEach((key, index) => {
                        all.push({ key: key, location: subject });

                        // once this is done, we call the recursive against the subject's children (continuing the down the tree)
                        iterationRecursive(subject[key], all);
                    });

                    return all;
                }

                iterationRecursive(target[key], allFound);

                // allFound should now contain all items that match up to this point.
                // that is what this step returns
                const nextKeys = allFound;
                const work = nextKeys.length === 0 ?
                    [{ key: key, current: target }] :
                    nextKeys.map((item, i) => {
                        return { key: item.key, current: item.location }
                    });

                // now that we have the work items, generate a container for them
                const properContainer = ((all) => {
                    let containingArray = [];
                    all.forEach((item) => {
                        if (typeof item.location === 'object') {
                            containingArray = containingArray.concat([item.location]);
                        }
                    });

                    return [...new Set(containingArray)];
                })(iterationRecursive(target, []));

                outcome = {
                    matched: true,
                    keys: nextKeys,
                    container: post?.enumerate !== true ? properContainer : undefined,
                    work: work
                };
            } else if (subStep.type === TokenTypes.array) {
                // this always matches any array
                if (Array.isArray(target)) {
                    // this always matches, so get all of the keys and continue on each
                    const nextKeys = typeof target[key] === 'object' ?
                        Object.entries(target[key]).map((set, index) => set[0]) :
                        (Array.isArray(target[key]) ? target[key].keys() :
                            []);

                    const work = nextKeys.length === 0 ?
                        [{ key: key, current: target }] :
                        nextKeys.map((k, i) => {
                            return { key: k, current: target[key] }
                        });

                    outcome = {
                        matched: true,
                        keys: nextKeys,
                        container: postOperationContainer,
                        work: work
                    };
                }
            }

            return outcome;
        }

        // a path run is a sequence of keys that, when resolved, navigate through the structure
        // executing a path run results in a set of operation descriptions indicating the container and 
        //      the keys in that container that should be further examined (or are the query result, if this is the last step)

        // the keys (in container) that will be further processed, according to matching conditions
        let furtherKeys = [];

        let matchContainer = undefined;

        let workSets = [{ key: key, current: container }];
        for (let i = 0; i < step.content.length; i++) {
            const subStep = step.content[i];
            let resultingWork = []; // this is where the loop stores its work before moving it to workSets

            if (subStep.type === TokenTypes.separator) {
                // nothing to do, skip it unless this is the last iteration
                if (i < (step.content.length - 1)) {
                    continue;
                }
            } else {
                let responses = [];
                // each successive step in the pathrun further filters the previous step's keys
                // so: 
                //      execute the evauation method against each key in the current step 
                //      and then overwrite them with the new set
                workSets.forEach((item, index) => {
                    let outcome;
                    if (subStep.subType === TokenSubTypes.function) {
                        outcome = this.#resolveFunction(subStep, item.current, item.key, responses, onEachFound, log);
                    } else {
                        outcome = doStep(subStep, item.current, item.key, responses, onEachFound, log, postOperation);
                    }

                    if (outcome.matched === true) {
                        resultingWork = this.#merge(resultingWork, outcome.work);
                        matchContainer = outcome.container;
                    }
                });
            }

            if (resultingWork.length === 0) {
                // no matches.  we're done -- as a failure
                break;
            } else if (i === (step.content.length - 1)) {
                // last iteration, copy the containers over
                furtherKeys = this.#merge(furtherKeys, resultingWork);
            } else {
                // we aren't done processing the steps, 
                // overwrite workSets with resultingWork to give the next step its job details
                workSets = resultingWork;
            }

            // if this is a deletion query (remove this property, as opposed to just finding it)
            // how that is done depends on the type of the final token, and potentially the preceding one
            if (i >= (step.content.length - 1) && isRemovalQuery) {
                if (subStep.type === TokenTypes.key) {
                    // loop through and delete the matching properties
                    for (let itemIndex = 0; itemIndex < workSets.length; itemIndex++) {
                        if (workSets[itemIndex].key in workSets[itemIndex].current && workSets[itemIndex].key === subStep.content) {
                            delete workSets[itemIndex].current[workSets[itemIndex].key];
                        }
                    }
                } else if (subStep.type === TokenTypes.any) {
                    // loop through and delete all properties
                    for (let itemIndex = 0; itemIndex < workSets.length; itemIndex++) {
                        if (workSets[itemIndex].key in workSets[itemIndex].current) {
                            delete workSets[itemIndex].current[workSets[itemIndex].key];
                        }
                    }
                } else if (subStep.type === TokenTypes.anyAtAll) {
                    // loop through and delete all properties
                    for (let itemIndex = 0; itemIndex < workSets.length; itemIndex++) {
                        if (workSets[itemIndex].key in workSets[itemIndex].current) {
                            delete workSets[itemIndex].current[workSets[itemIndex].key];
                        }
                    }
                } else if (subStep.type === TokenTypes.array) {
                    // delete all items
                    for (let itemIndex = 0; itemIndex < workSets.length; itemIndex++) {
                        if (workSets[itemIndex].key in workSets[itemIndex].current) {
                            delete workSets[itemIndex].current[workSets[itemIndex].key];
                        }
                    }
                }
            }
        }

        return {
            matched: furtherKeys.length > 0,
            matches: furtherKeys,  // matches is the keys that match
            container: matchContainer
        };
    }

    /**
     * A function call is a key pointing to a property where a function is housed, 
     * optionally paired with an array of parameters for the function
     * @param {object} step The function call step to resolve
     * @param {object | Array} container The current container within the queried structure
     * @param {String} key The key pointing to the function in the container structure
     * @param {Array} result The result array.  Populated by endpoint matches
     * @param {function} onEachFound This callback will be executed against each match found within the structure. Single parameter: the object found
     * @param {Array} log The operational log
     * @returns An object of the form { matched: Boolean, container: *new focus* } 
     */
    static #resolveFunction(step, container, key, result, onEachFound, log) {
        let outcome = {
            matched: false,
            result: undefined,
            work: [],
        };

        if (!!container[key] && typeof container[key] === 'function') {
            let funcResult;

            try {
                // execute the function
                if (!!step.parameters) {
                    funcResult = container[key](...step.parameters);
                } else {
                    funcResult = container[key]();
                }

                outcome.matched = true;
                outcome.result = funcResult;
            } catch (err) {
                // we don't care if your function dies on transit, only that it didn't match (because it failed)
                // the outcome of your function is the exception
                outcome.result = err;
            }
        }

        if (!!outcome.result) {
            // generate the work items if there was an outcome
            const nextKeys = typeof outcome.result === 'object' ?
                Object.entries(outcome.result).map((set, index) => set[0]) :
                (Array.isArray(outcome.result) ? outcome.result.keys() :
                    []);

            outcome = {
                ...outcome,
                keys: nextKeys,
                work: nextKeys.length === 0 ?
                    [{ key: key, current: outcome.result }] :
                    nextKeys.map((k, i) => {
                        return { key: k, current: outcome.result }
                    })
            };
        }

        return outcome;
    }

    /**
     * A conversion resolves down to an array of objects or a singular object.  This statement updates the context.
     * @param {object} step The conversion step to resolve
     * @param {object | Array} container The current container within the queried structure
     * @param {String} key The key for comparison to continue the query
     * @param {Array} result The result array.  Populated by endpoint matches
     * @param {function} onEachFound This callback will be executed against each match found within the structure. Single parameter: the object found
     * @param {Array} log The operational log
     * @param {boolean} isPostOperationConvert If true, this method was called as a post operation for a query.  Otherwise, it is part of the query
     * @returns An object of the form { matched: Boolean, container: *new focus* } 
     */
    static #resolveConversion(step, container, key, result, onEachFound, log, isPostOperationConvert = false) {
        let outcome = {
            matched: false,
            matches: [],
            work: [],
        }

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

                const sourceQueryTarget = operation.anchored === true ? this.#anchor : source;

                // derive the list of keys.  
                // this is only necessary if a wildcard is used to start the source query
                let keys = [query.content[0].content[0].content];
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

                keys.forEach((k) => {
                    this.#resolve(
                        query.content,
                        sourceQueryTarget,
                        k,
                        resources,
                        undefined,
                        errors,
                        query.postOperation);
                });

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
                // take the each denial and execute it, omitting the final query step, as a query against the target,
                // this will give the container of the target property
                // then check for the target property
                //      if it exists, delete it
                //      if it does not, the denial fails

                let denialResult = [];
                let denialLog = [];

                // count back from the end of the pathrun (starting one shy of the end) until we find a non-wildcard key
                const cutoffIndex = (() => {
                    let indexResult = -1;
                    for (let cI = operation.source.content.length - 2; cI > 0; cI--) {
                        const targetToken = operation.source.content[cI];
                        if ([TokenTypes.any, TokenTypes.anyAtAll, TokenTypes.array].includes(targetToken.type) === false) {
                            indexResult = cI;
                            break;
                        }
                    }

                    return indexResult;
                })();

                // make a modified pathrun that stops one level of depth shy of the end
                // this is necessary because we want the object that contains the property to delete
                const deletePath = {
                    ...operation.source,
                    content: operation.source.content.slice(0, cutoffIndex)
                }

                // call a deletion query to remove the target
                const denialQuery = this.#resolvePathRun(
                    operation.source,
                    conversionResult,
                    operation.source.content[0].content,
                    denialResult,
                    undefined,
                    denialLog,
                    undefined,
                    true);

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
                // failure is silent because convertion will encounter things it cannot convert.  
                // it would likely never succeed if it failed with a shout every time
                return undefined;
            }

            if (errors.length === 0) {
                return conversionResult;
            } else {
                return;
            }
        }

        //const topic = isPostOperationConvert === true ? container[key] : container[key];
        const topic = isPostOperationConvert ? container[key] : container;
        if (!!topic) {
            if (Array.isArray(topic)) {
                const convertResults = topic.map((item, index) => {
                    const plan = buildConversionPlan(step.content, step.inclusive, item);
                    let conversionResult = convert(item, plan);

                    return conversionResult;
                });

                convertResults.forEach((item) => {
                    if (!!item) {
                        outcome.matches.push(item);
                    }
                });
            } else if (typeof topic === 'object') {
                const plan = buildConversionPlan(step.content, step.inclusive, topic);
                let conversionResult = convert(topic, plan);

                if (!!conversionResult) {
                    outcome.matches.push(conversionResult);
                }
            } else {
                log.push({ 'step': key, 'reason': `Cannot convert value '${topic}'` });
            }
        } else {
            log.push({ 'step': key, 'reason': `Context did not contain key. Context: ${JSON.stringify(container)} key: ${key}` });
        }

        outcome.matched = errors.length === 0 && outcome.matches.length > 0;
        if (outcome.matched === true) {
            if (isPostOperationConvert === true) {
                outcome.matches.forEach((item) => result.push(item));
            }

            // generate work items for every property in every match
            let work = [];
            outcome.matches.forEach((item) => {
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

        this.#monitor.add(outcome);
        return outcome;
    }

    /**
     * Checks to see if the given query matches the given structure.  Returns a boolean value indicating if any match was found.
     * 
     * @param {String} query The query string to execute against the subject
     * @param {Array | object} subject An object or array to query
     * @param {object} parameterDictionary A dictionary of key->parameter array sets for use with any function calls
     */
    static match(query, subject, parameterDictionary) {
        return this.#find(query, subject, undefined, undefined, parameterDictionary)?.length > 0;
    }

    /**
     * Calls a callback fuction against each match as it is found and returns all matches upon completion.
     * 
     * @param {String} query The query string to execute against the subject
     * @param {Array | object} subject An object or array to query
     * @param {function} actionCallback A function to call when something is found that matches
     * @param {object} parameterDictionary A dictionary of key->parameter array sets for use with any function calls
     */
    static with(query, subject, actionCallback, parameterDictionary) {
        return this.#find(query, subject, actionCallback, undefined, parameterDictionary);
    }

    /**
     * Executes the query provided in query string against the subject item and returns the resulting matches.
     * 
     * @param {String} query The query string to execute against the subject
     * @param {Array | object} subject An object or array to query
     * @param {object} parameterDictionary A dictionary of key->parameter array sets for use with any function calls
     *  
     * returns the result
     */
    static where(query, subject, parameterDictionary) {
        return this.#find(query, subject, undefined, undefined, parameterDictionary);
    }

    /**
     * Executes the provided query string against the subject and places the item at all matching locations.
     * 
     * @param {String} target The query indicating where to place the item.  Multiple matches will result in the item getting placed in all indicated locations.
     * @param {Array | object} subject The object to execute the query against
     * @param {any} item The object to insert into the subject
     * @param {String | Number} key On objects, this is the property name to insert the item under.  For arrays, it should be the index.
     * @param {object} parameterDictionary A dictionary of key->parameter array sets for use with any function calls
     * 
     * returns the result (post modifications)
     */
    static insert(target, subject, item, key, parameterDictionary) {
        outcome = this.#find(target, subject, undefined, undefined, parameterDictionary);

        for (let i = 0; i < outcome.length; i++) {
            outcome[i][key] = item;
        }

        return outcome;
    }
}