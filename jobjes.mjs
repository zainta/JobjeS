import jobjesInstance from "./jobjesInstance.mjs";

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
export default class JobjeS {
    /**
     * Safely adds an external function
     * @param {string} name The unique name key of the function
     * @param {string} description A description of how the function works
     * @param {function} func The function itself.  Note that any parameters beyond the first will have to be provided through subqueries.
     * @returns {object} an object describing the outcome.  The success property always states the outcome as true or false
     */
    static addExternal(name, description, func) {
        return jobjesInstance.addExternal(name, description, func);
    }

    /**
     * Returns the actual array containing the defined external functions
     * @returns {object[]} The actual external function array instance
     */
    static getExternals() {
        return jobjesInstance.getExternals();
    }

    /**
     * Checks to see if the given query matches the given structure.  Returns a boolean value indicating if any match was found.
     * 
     * @param {String} query The query string to execute against the subject
     * @param {Array | object} subject An object or array to query
     * @param {object} [parameterDictionary=undefined] A dictionary of key->parameter array sets for use with any function calls
     * @param {any[]} [errorLog=[]] Provide an array of your own to receive any errors encountered during execution
     * @returns {boolean} A value indicating if any matches were found
     */
    static match(query, subject, parameterDictionary, errorLog = []) {
        const jjI = new jobjesInstance(true, undefined, parameterDictionary, errorLog);

        return jjI.match(query, subject);
    }

    /**
     * Calls a callback fuction against each match as it is found and returns all matches upon completion.
     * 
     * @param {String} query The query string to execute against the subject
     * @param {Array | object} subject An object or array to query
     * @param {object} [parameterDictionary=undefined] A dictionary of key->parameter array sets for use with any function calls
     * @param {function} [actionCallback=undefined] A function to call when something is found that matches
     * @param {any[]} [errorLog=[]] Provide an array of your own to receive any errors encountered during execution
     * @returns {any[]} The query's result
     */
    static with(query, subject, actionCallback = undefined, parameterDictionary = undefined, errorLog = []) {
        const jjI = new jobjesInstance(true, actionCallback, parameterDictionary, errorLog);

        return jjI.where(query, subject);
    }

    /**
     * Executes the query provided in query string against the subject item and returns the resulting matches.
     * 
     * @param {String} query The query string to execute against the subject
     * @param {Array | object} subject An object or array to query
     * @param {object} [parameterDictionary=undefined] A dictionary of key->parameter array sets for use with any function calls
     * @param {any[]} [errorLog=[]] Provide an array of your own to receive any errors encountered during execution
     * @returns {any[]} The query's result
     */
    static where(query, subject, parameterDictionary, errorLog = []) {
        const jjI = new jobjesInstance(true, undefined, parameterDictionary, errorLog);

        return jjI.where(query, subject);
    }

    /**
     * Executes the provided query string against the subject and places the item at all matching locations.
     * 
     * @param {String} query The query indicating where to place the item.  Multiple matches will result in the item getting placed in all indicated locations.
     * @param {Array | object} subject The object to execute the query against
     * @param {any} item The object to insert into the subject
     * @param {String | Number} key On objects, this is the property name to insert the item under.  For arrays, it should be the index.
     * @param {object} parameterDictionary A dictionary of key->parameter array sets for use with any function calls
     * @param {any[]} [errorLog=[]] Provide an array of your own to receive any errors encountered during execution
     * @returns {any[]} The query's modified results
     */
    static insert(query, subject, item, key, parameterDictionary, errorLog = []) {
        const jjI = new jobjesInstance(true, undefined, parameterDictionary, errorLog);
        let outcome = jjI.where(query, subject);

        for (let i = 0; i < outcome.length; i++) {
            outcome[i][key] = item;
        }

        return outcome;
    }
}