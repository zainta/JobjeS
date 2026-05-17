import { JobjeSTokenizer, TokenSubTypes, TokenTypes } from './jobjesTokenizer.mjs';
import { duplicate, isRegex } from './jobjesUtility.mjs';

/*
Copyright (C) Zain T. Al-Ahmary

MIT license.  I am not response for how you use or what happens as a result of what you use this for.
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
 *         ** : This select atches "any and all".  It does the same thing as *, but to every possible depth, traversing the entire 
 *          structure and executing subsequent query details against each sub item.  Obviously, this is massively costly in terms of 
 *          relative execution time, especially in large structures.
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
 *  To connect conditions and parentheticals, operators can be used.  The following operators are supported:
 * 
 *      && : Ensures that all conditions / parentheticals in the chain evaluate as true.
 *      || : Ensures that at least one of the conditions / parentheticals in the chain evaluate as true.
 * 
 * Note for usage:
 *      When using this system, context is massively important.  If the results you get aren't what you expected, consider context.
 * 
 */
export default class JobjeS {
    static #targetDivider = ':';
    static #pathseparator = '.';
    static #defaultLog = [];

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
        if (set.includes(item) === false) {
            set.push(item);
            if (!!onEachFound && typeof onEachFound === 'function') onEachFound(item);
        }
    }

    // merge two arrays without duplicates
    static #merge(set1, set2) {
        // use JSON.stringify to detect duplicates
        let str1 = set1.map((item) => JSON.stringify(item));
        let str2 = set2.map((item) => JSON.stringify(item));

        return [...(new Set(str1.concat(str2)))].map((item) => JSON.parse(item));
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
     * 
     * Returns an array containing all matches
     */
    static #find(query, subject, onEachFound, externalLog) {
        if (typeof query !== 'string') return [];
        if (typeof subject !== 'object' && !Array.isArray(subject)) return [];

        // note that this will replace the tokenizer with the resulting tokens
        const tokenizer = new JobjeSTokenizer();
        const tokens = tokenizer.Tokenize(query, JobjeS.#targetDivider, JobjeS.#pathseparator);
        if (tokens.length === 0)
            return [];

        let result = [];
        this.#defaultLog = [];
        let log = !!externalLog ? externalLog : this.#defaultLog;

        // begin by deriving an array of keys from the subject.
        // These will be the indices in the case of an array.
        const keys = typeof subject === 'object' ?
            Object.entries(subject).map((set, index) => set[0]) :
            (Array.isArray(subject) ? subject.keys() :
                []);

        keys.forEach((key, index) => {
            this.#resolve(duplicate(tokens), subject, key, result, onEachFound, log);
        });

        return result;
    }

    /**
     * Resolves the given series of query steps and returns the resolution
     * @param {object} querySteps The current query to resolve
     * @param {object | Array} container The current container within the queried structure
     * @param {String} key The key for comparison to continue the query
     * @param {Array} result The result array.  Populated by endpoint matches
     * @param {function} onEachFound This callback will be executed against each match found within the structure. Single parameter: the object found
     * @param {Array} log The operational log
     * @returns An object of the form { matched: Boolean, container: *new focus* } 
     */
    static #resolve(querySteps, container, key, result, onEachFound, log) {
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
                outcome = this.#resolvePathRun(step, container, key, result, onEachFound, log);
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
                    // can the target support further processing?
                    if (Array.isArray(container[key]) || typeof container[key] === 'object') {
                        // the outcome from the step will handle select traversal,
                        // so, all we have to do is run the next step if the need exists

                        // we resolve against each work item in the matches set
                        for (let i = 0; i < outcome.matches.length; i++) {
                            this.#resolve(
                                querySteps.slice(stepIndex + 1),
                                outcome.matches[i].current,
                                outcome.matches[i].key,
                                result,
                                onEachFound,
                                log);
                        }

                        // note that resolve doesn't actually ever return anything.
                    }
                    // no else here because we have more query, but don't have more targets.
                    // that means our query doesn't match.
                }
            } else {
                // this is the end of our search, and our target
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
            if (condition.type !== TokenTypes.condition) {
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
                                    outcome = container[key].match(re)?.length > 0;
                                } else {
                                    outcome = JSON.stringify(container[key]).match(re)?.length > 0;
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

        const executeNestedCondition = (condition, container, key, previousOutcome) => {
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
                                outcome = container[key].match(re)?.length > 0;
                            } else {
                                outcome = JSON.stringify(container[key]).match(re)?.length > 0;
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
                const conditionKey = step.content[0].content;

                // confirm that that token key matches the expected
                if (conditionKey === key) {

                    // step 2, confirm that a colon is next
                    if (step.content[1].type === TokenTypes.divider) {
                        // skip it.  we don't care, it just separates the key and the rule

                        let conditionResults = !!step.precedingOutcome ? [step.precedingOutcome] : [];
                        // step 3, get the condition tokens.
                        // everything from index 2 onward should be conditions, 
                        // so loop through them and perform the logical operations
                        for (let i = 2; i < step.content.length; i++) {
                            const lastOutcome = conditionResults.slice(conditionResults.length - 1);
                            conditionResults.push(
                                executeCondition(
                                    step.content[i],
                                    container,
                                    conditionKey,
                                    lastOutcome.length === 1 ? lastOutcome[0] : undefined));
                        }

                        const lastOutcome = conditionResults.slice(conditionResults.length - 1);
                        // the only outcome we care about is the final one.
                        outcome = {
                            matched: lastOutcome.length === 1 ? lastOutcome[0] : false,
                            matches: [{ key: key, current: container }],
                            isSelect: false,
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
     * @returns An object of the form { matched: Boolean, container: *new focus* } 
     */
    static #resolvePathRun(step, container, key, result, onEachFound, log) {
        const doStep = (subStep, target, key, results, onEachFound, log) => {
            let outcome = {
                matched: false,
                keys: [],
                work: []
            };

            if (subStep.type === TokenTypes.key) {
                if (subStep.subType === TokenSubTypes.positiveKey) {
                    if ((subStep.content in target) === true && subStep.content === key) {
                        const nextKeys = typeof target[key] === 'object' ?
                            Object.entries(target[key]).map((set, index) => set[0]) :
                            (Array.isArray(target[key]) ? target[key].keys() :
                                []);

                        outcome = {
                            matched: true,
                            keys: nextKeys,
                            work: nextKeys.length === 0 ?
                                [{ key: key, current: target }] :
                                nextKeys.map((k, i) => {
                                    return { key: k, current: target[key] }
                                })
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

                        outcome = {
                            matched: true,
                            keys: nextKeys,
                            work: nextKeys.length === 0 ?
                                [{ key: key, current: target }] :
                                nextKeys.map((k, i) => {
                                    return { key: k, current: target[key] }
                                })
                        };
                    }
                }
            } else if (subStep.type === TokenTypes.any) {
                // this always matches, so get all of the keys and continue on each
                const nextKeys = typeof target[key] === 'object' ?
                    Object.entries(target[key]).map((set, index) => set[0]) :
                    (Array.isArray(target[key]) ? target[key].keys() :
                        []);

                outcome = {
                    matched: true,
                    keys: nextKeys,
                    work: nextKeys.length === 0 ?
                        [{ key: key, current: target }] :
                        nextKeys.map((k, i) => {
                            return { key: k, current: target[key] }
                        })
                };
            } else if (subStep.type === TokenTypes.anyAtAll) {
                // this always matches *everything to any depth*
                // this means that we recursively iterate through the tree, 
                //      gather every path node in the structure, and return them as a flat list
                let allFound = [];
                const iterationRecursive = (subject, query) => {
                    const keys = typeof subject === 'object' ?
                        Object.entries(subject).map((set, index) => set[0]) :
                        (Array.isArray(subject) ? subject.keys() :
                            []);

                    keys.forEach((key, index) => {
                        allFound.push(subject[key]);

                        // once this is done, we call the recursive against the subject's children (continuing the down the tree)
                        iterationRecursive(subject[key]);
                    });
                }

                iterationRecursive(target[key]);

                // allFound should now contain all items that much up to this point.
                // that is what this step returns
                const nextKeys = allFound;

                outcome = {
                    matched: true,
                    keys: nextKeys,
                    work: nextKeys.length === 0 ?
                        [{ key: key, current: target }] :
                        nextKeys.map((k, i) => {
                            return { key: k, current: target[key] }
                        })
                };
            } else if (subStep.type === TokenTypes.parenthetical) {
                this.#resolveParenthetical(step, target, key, results, onEachFound, log);
            }

            return outcome;
        }

        // a path run is a sequence of keys that, when resolved, navigate through the structure
        // executing a path run results in a set of operation descriptions indicating the container and 
        //      the keys in that container that should be further examined (or are the query result, if this is the last step)

        // the keys (in container) that will be further processed, according to matching conditions
        let furtherKeys = [];

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
                    const outcome = doStep(subStep, item.current, item.key, responses, onEachFound, log);

                    if (outcome.matched === true) {
                        resultingWork = this.#merge(resultingWork, outcome.work);
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
        }

        return {
            matched: furtherKeys.length > 0,
            matches: furtherKeys  // matches is the keys that match
        };
    }

    /**
     * Checks to see if the given query matches the given structure.  Returns a boolean value indicating if any match was found.
     * 
     * @param {String} query The query string to execute against the subject
     * @param {Array | object} subject An object or array to query
     */
    static match(query, subject) {
        return this.#find(query, subject)?.length > 0;
    }

    /**
     * Calls a callback fuction against each match as it is found and returns all matches upon completion.
     * 
     * @param {String} query The query string to execute against the subject
     * @param {Array | object} subject An object or array to query
     * @param {function} actionCallback A function to call when something is found that matches
     */
    static with(query, subject, actionCallback) {
        return this.#find(query, subject, actionCallback);
    }

    /**
     * Executes the query provided in query string against the subject item and returns the resulting matches.
     * 
     * @param {String} query The query string to execute against the subject
     * @param {Array | object} subject An object or array to query
     *  
     * returns the result
     */
    static where(query, subject) {
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
    static insert(target, subject, item, key) {
        outcome = this.#find(target, subject);

        for (let i = 0; i < outcome.length; i++) {
            outcome[i][key] = item;
        }

        return outcome;
    }
}