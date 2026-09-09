# JobjeS

# Version Information

* Initial Version -- 1.0.1

* 1.1.0
    * Functions
* 1.2.0
    * Filters
* 1.3.0
    * Subqueries and post query operators
* 1.4.0
    * The array select `@` and conversions    
    * Properly implemented the `**` operator
    * Revamped `>` and `<` query operators to be more consistent.  
        * Note: 
            * they aren't capable of altering context
            * they only find the closest (immediate or direct parent) object when doing their task
    * Keys are no longer prohibited from matching JavaScript keywords.
* version 1.5.2:
    * Keys no longer conform to JS naming convensions, allowing spaces and abnormal characters.  They are still case sensitive.
        * Implemented "any" keys.  (e.g. `&<key>&`)
    * String values now support both single and double quotes. (`'` and `"`)
    * Added support for external functions.  
        * These functions are defined in a user editable array on the JobjeSInstance object.
    * Made an optimization pass
        * Rebuilt the system to make queries step between the items in the structure, rather than the key sets in the items
            * THIS IS POTENTIALLY A BREAKING CHANGE DUE TO FORCING QUERIES TO START AT THE FIRST NODE INSTEAD OF ITS CONTENTS (see examples)
    * Restructured the object system
        * Offloaded all functionality from the static object `JobjeS` into an instanced object `JobjeSInstance` (that can be used for persistent configuration)
        * Static object is now a wrapper (exposed functionality has grown to support external function configuration)
        * Namespaces:
            * Static object `JobjeS` is in namespace `jobjes`.
            * Instance object `JobjeSInstance` is in namespace `jobjes/instance`.

## Introduction
JobjeS is short for JavaScript Object Search.  It is a query language for validating and searching array and object structures within JavaScript.

## Installation
To install from NPM, use `npm i jobjes`.

## Usage
This library allows regular expression like queries to be executed against an arbitrary array or object literal structure and return any items that match the query.

Queries are broken up into subqueries.  These can be defined explicitly with square brackets (`[` and `]`) or implicitly (they are used behind the scenes anyway).  Multiple queries can be executed in sequence (note that context resets between subqueries) via the sequence operator `,` and merge operator `+`.  The merge operator concatenates results between the merged queries, but otherwise does not modify them.  The sequence operator carries each set as its own array.
 
There are three key terms in the way queries are executed:
* Selects:
    * A select is anything that moves the context forward.  This is limited to paths. (i.e. sequences of references to properties, termed keys, within the structure)

    * e.g. given the object `{ set: [ 1, 2, 3, 4 ], id: 'first' }` `set` and `id` are keys in the immediate context.  So are `1`, `2`, `3`, and `4` within the context of the array under `'set'`.
* Conditions:
    * A condition is anything that is used to filter results.  

    * They come in two forms:
        * Full:
            * A full condition is a key followed by a divider (default ':') and then a value item.  (more on that later).  

            * When executing a full condition, the value item is evaluated against the content of the given key without altering the context.
        * Nested:
            * A nested condition is a value item, whether following an operator or separator.  (more on those later).

            * When executing a nested condition, the value item is evaluated against the current context.
         
    * All conditions limit the context of operations that follow them, but do not act as selects.
* Parentheticals:
    * A parenthetical, i.e. operations within parenthesis, executes under the originating context, but any changes it makes to context are limited in scope to it.  This means that any selects that occur within it are forgotten when leaving the parenthesis.

    * Parentheticals can be nested "infinitely".  Heaps do exist.

## Definitions
Below are the selects within the system:
* `<key>` : 
    * any direct reference to a property name is termed a `"key"`, and will only match that key.  Within the current context, this will move the execution context to the content of that key.  Meaning that given the structure, `{ set: [ 1, 2, 3, 4 ], id: 'first' }`, the key `'set'` will result in the context moving to the array under set.  i.e. `[ 1, 2, 3, 4 ]`.

    Note: version 1.5.2 introduces "any" keys, which can contain any characters.  They are denoted with a pair of `&`'s, just lika a string is denoted with `"`'s or `'`'s.
* `*` : 
    * This select matches "any" key.  Meaning, within the structure, `{ set: [ 1, 2, 3, 4 ], id: 'first' }`, the `*` select would match the content of both `'set'` and `'id'`.
 
* `**` : 
    * This select matches "any and all".  It does the same thing as `*`, but to every possible depth, traversing the entire structure and executing subsequent query details against each sub item.  Obviously, this is massively costly in terms of relative execution time, especially in large structures.

* `@` : 
    * This select matches "any array" key.  This functions identically to '*' except that it does not match objects.  

* Function : 
    * A function call follows the form `<key>;<parameter tag>`.  A `<parameter tag>` is a term, provided as a parameter as seen in the accompanying examples, that is a reference to the parameter array for the function.  If the function does not require parameters, this should be omitted.  Functions can be used as normal selects and as the left part of a full condition.  


* Filter : 
    * A filter is identical to a full condition except that it acts like a select.  Filters advance the context.  Filters replace the normal divider (default: ':') with a number symbol '#'.

    
*  Conversion: 
    * A conversion is a block, marked by a pair of curly brackets, `{` and `}`, and populated by conversion operations.  They build an object literal(s) that then becomes the context.  What follows is a description of the conversion operations.
        * `+>` : Inclusions follow the pattern `[subquery]+>[pathrun]`, where the `subquery` retrieves value(s) which are inserted into the resulting object at the given `pathrun` location.
        * `->` : Blocks remove the provided `pathrun` from the resulting object literal.  They follow this pattern: `[pathrun]->`.
        * `!!>` : If found operations follow this pattern: `[subquery]!!>[subquery] or [value],[pathrun]`.  They execute the first `subquery`, and if they find something, they execute the second `subquery` and use the result, or the literal value, and place it at the `pathrun` in the resulting object literal.
        * `!>` : If not found operations follow this pattern: `[subquery]!>[subquery] or [value],[pathrun]`.  They execute the first `subquery`, and if they do not find something, they execute the second `subquery` and use the result, or the literal value, and place it at the `pathrun` in the resulting object literal.  
 
    * Note: Any existing path that contains a single value (number, string, etc) that is updated, will be overwritten.
    * Note: By default, all conversion operations are required to succeed for anything to be returned, but they can be made individually optional by immediately preceding the operator with a dash (`-`).
    * Note: By default, conversions start empty and are filled by the user.  You can make them "inclusive", (i.e. automatically copy all properties that are not accounted for by explicit conversion operations over afterward), by adding a plus, `+`, just inside of the opening curly bracket, `{`.


*  External Function:
    *  An external function is an inbuilt (or user added) function that can be called during a query.  External functions' names follow <key> rules, meaning that they can have spaces.
    * They are referenced by their name, as defined in the external function array, preceded by a dollar sign '$' and followed by parenthesis.  In the form `$<function name>([param,param,...])`.
        * The function set can be modified using these functions (off of both the instance and static objects):
            * `static addExternal(name, description, func)`
            * `static getExternals()`

    * External functions receive the parameters as follows (in this order):
        * The current context:
            * The current query execution context.
        * The current relationship monitor:
            * A simple class that monitors parental relationships within the queried structure.
        * Any parameters supplied through the query (executed as querires):
            * The parameters the user explicitly supplies between the parenthesis in the call.

            * Note: to provide literals to an external function, precede them with a `$`.  This will make the value immediately following count as a `<parameter tag>`, like those used for functions (see above).  Also reference Function Examples in the example code.
            * e.g. `$count('this is a query', $'this is a literal')`
    * External functions can return an object literal, array, or scalar value.  They change context, and thus count as selects.

Below are the value items within the system:
* Note that all definitions below are full conditions.  To convert them into nested conditions, simply remove the key and divider (default ':').
 
* `<key>:!!` : 
    * exists, checks to see if the given `<key>` is defined on the object
 
*  `<key>:!` : 
    * does not exist, checks to see if the given `<key>` is not defined on the object. (never matches as a nested, because the context must exist prior to it getting evaluated)
 
* `<key>:!!<value>` : 
    * positive value, checks to see if the given `<key>` has the given value
 
* `<key>:!<value>` : 
    * negative value, checks to see if the given `<key>` does not have the given value
 
* `<key>:/regexp/` : 
    * regular expression, checks to see if the given `<key>`'s value matches the regular expression
 
To connect conditions and parentheticals, operators can be used.  The following operators are supported:
* `&&` : 
    * Ensures that all conditions / parentheticals in the chain evaluate as true.
* `||` : 
    * Ensures that at least one of the conditions / parentheticals in the chain evaluate as true.

Subqueries support post operators.  They are placed immediately following the query itself.  They support the following:
* `>` :
    * The `>` post operator maintains the state of object results from queries.  This will, for example, return a clean array of objects from the `*` operator, rather than every object and its properties.
* `<` :
    * The `<` post operator enumerates the query results. This, for example, will return an array of the properties in an object literal rather than the object itself.
 
## Import Final Note
When using this system, context is massively important.  If the results you get aren't what you expected, consider context.

## Some Examples

Given the structure:

```
export const obj = {
    'func': () => { return { "greeting": "hi!", "action": { "jump": "10 feet" } } },
    'tests': [
        {
            'label': 'Test',
            'outcome': true,
            'projects': {
                'duration': 'two weeks',
                'personnel': '4',
                'leader': 'Jared'
            }
        },
        {
            'label': 'Test2',
            'outcome': false,
            'projects': {
                'duration': 'a week',
                'personnel': '7',
                'leader': 'Scott'
            }
        },
        {
            'label': 'Test3',
            'outcome': false,
            'projects': {
                'duration': 'eight days',
                'personnel': '2',
                'leader': 'Jared'
            }
        },
        {
            'label': 'Test4',
            'outcome': true,
            'jump': (height) => { return { "sound": "hup!", "height": height }; }
        }
    ],
    'seasons': {
        'winter': {
            'temperature': 'freezing',
            'duration': 'a few months',
            'activities': [
                'skiing',
                'snowboarding'
            ]
        },
        'spring': {
            'temperature': 'cold',
            'duration': 'a few months',
            'activities': [
                'hiking',
                'kyaking'
            ]
        },
        'summer': {
            'temperature': 'hot',
            'duration': 'a few months',
            'activities': [
                'hiking',
                'running',
                'kyaking'
            ]
        },
        'autumn': {
            'temperature': 'chilly',
            'duration': 'a few months',
            'activities': [
                'hiking',
                'dirtbiking'
            ]
        }
    },
    'awning listing': {
        'light': [
            {
                'manufacturer': 'Rawshank Builders',
                'size': 'medium',
                'weight': '100kg'
            },
            {
                'manufacturer': 'Lawshank Incorporated',
                'size': 'small',
                'weight': '40kg'
            },
            {
                'manufacturer': 'Complete Solutions Inc.',
                'size': 'small',
                'weight': '62kg'
            }
        ],
        'medium': [
            {
                'manufacturer': 'Rawshank Builders',
                'size': 'large',
                'weight': '320kg'
            },
            {
                'manufacturer': 'Crafted Primary',
                'size': 'large',
                'weight': '20kg'
            },
            {
                'manufacturer': 'Lawshank Incorporated',
                'size': 'small',
                'weight': '100kg'
            },
            {
                'manufacturer': 'Lawshank Incorporated',
                'size': 'medium',
                'weight': '10kg'
            }
        ],
        'heavy': [
            {
                'manufacturer': 'Rawshank Builders',
                'size': 'large',
                'weight': '200kg'
            },
            {
                'manufacturer': 'Lawshank Incorporated',
                'size': 'large',
                'weight': '80kg'
            },
            {
                'manufacturer': 'Crafted Primary',
                'size': 'medium',
                'weight': '322kg'
            }
        ],
    }
}
```

Note:
In the examples below, both instanced and static examples are identical in their functionality.

The follow examples demonstrate the usage of the static wrapper class.  They have validation lines built in.
```
let testErrorLog = [];
let testErrors = [];
const consoleOutput = true;
const log = (testName, toConsole = consoleOutput) => {
    const message = `Test '${testName}' failed`;
    testErrors.push(message);
    if (toConsole) {
        console.log(message);
    }
}

// Some query examples
{
    // result: the contents of the array at the given location
    const simpleExample1 = JobjeS.where('awning listing.medium', obj, undefined, testErrorLog);
    if (simpleExample1[0].every((item) => obj['awning listing']['medium'].includes(item)) === false) {
        log("simpleExample1");
    }

    // result: 2
    const simpleExample2 = JobjeS.where('tests.2.projects.personnel', obj, undefined, testErrorLog);
    if (JSON.stringify(simpleExample2) !== '["2"]') {
        log("simpleExample2");
    }

    // result: nothing
    // reason: the 3rd object in the tests property array has a projects.duration value of 'eight days', not 'a week'.
    const simpleExample3 = JobjeS.where('tests.2.projects.duration:"a week".personnel', obj, undefined, testErrorLog);
    if (JSON.stringify(simpleExample3) !== '[]') {
        log("simpleExample3");
    }

    // result: 2
    const simpleExample4 = JobjeS.where('tests.2.(projects.duration:"eight days").projects.personnel', obj, undefined, testErrorLog);
    if (JSON.stringify(simpleExample4) !== '["2"]') {
        log("simpleExample4");
    }

    // result: 7
    const simpleExample5 = JobjeS.where('tests.*.(projects.duration:"a week").projects.personnel', obj, undefined, testErrorLog);
    if (JSON.stringify(simpleExample5) !== '["7"]') {
        log("simpleExample5");
    }

    // result: the entire object
    const simpleExample6 = JobjeS.where('(tests.2.projects.personnel:!!)', obj, undefined, testErrorLog);
    if (JSON.stringify(simpleExample6) !== JSON.stringify([obj])) {
        // this doesn't take the functions into account, since stringify doesn't handle them, 
        // but it is close enough to test the structure matching
        log("simpleExample6");
    }

    // result: no match (nothing)
    const simpleExample7 = JobjeS.where('tests.2.projects.personnel.!', obj, undefined, testErrorLog);
    if (JSON.stringify(simpleExample7) !== '[]') {
        log("simpleExample7");
    }

    // result: {'duration': 'a week', 'personnel': '7', 'leader': 'Scott'}
    const simpleExample8 = JobjeS.where('tests.1.projects.personnel:"4"||"7"', obj, undefined, testErrorLog);
    if (JSON.stringify(simpleExample8) !== '[{"duration":"a week","personnel":"7","leader":"Scott"}]') {
        log("simpleExample8");
    }

    // result: 7, 2
    const simpleExample9 = JobjeS.where('tests.*.(projects.duration:"a week")||(projects.duration:"eight days").projects.personnel', obj, undefined, testErrorLog);
    if (JSON.stringify(simpleExample9) !== '["7","2"]') {
        log("simpleExample9");
    }

    // results: everything
    const simpleExample10 = JobjeS.where('((seasons.winter:!!)||(seasons.spring:!!))', obj, undefined, testErrorLog);
    if (JSON.stringify(simpleExample10) !== JSON.stringify([obj])) {
        // this doesn't take the functions into account, since stringify doesn't handle them, 
        // but it is close enough to test the structure matching
        log("simpleExample10");
    }

    // result: everything
    const simpleExample11 = JobjeS.where('(seasons.winter:!!||spring:!!)', obj, undefined, testErrorLog);
    if (JSON.stringify(simpleExample11) !== JSON.stringify([obj])) {
        // this doesn't take the functions into account, since stringify doesn't handle them, 
        // but it is close enough to test the structure matching
        log("simpleExample11");
    }

    // result: nothing
    // why, when the others return everything?
    //
    // Paths and Conditions are considered separately:
    // the second condition has the seasons path prior to spring condition, but the first path (i.e. seasons) preceding 
    // winter has already taken affect.  This means that the second path is looking for seasons.seasons, which doesn't exist.  
    // Because it cannot find that path, it fails to change the context, which supercedes the condition 
    //  (i.e. spring:!!) and causes the parenthetical to fail as a whole, returning false.
    const simpleExample12 = JobjeS.where('(seasons.winter:!!||seasons.spring:!!)', obj, undefined, testErrorLog);
    if (JSON.stringify(simpleExample12) !== "[]") {
        // this doesn't take the functions into account, since stringify doesn't handle them, 
        // but it is close enough to test the structure matching
        log("simpleExample12");
    }

    let pausePoint = 1;
}

// Subquery (multi queries in a single call) examples
{
    // baseline (to show what you would get without the post operators)
    const subqueryBase1 = JobjeS.where('[tests.*],[seasons.autumn]', obj, undefined, testErrorLog);
    // these tests illustrate the structure the system returns when executing multi-query calls
    if (JSON.stringify(subqueryBase1) !== JSON.stringify([obj["tests"], [obj["seasons"]["autumn"]]])) {
        log("subqueryBase1");
    }

    const subqueryBase2 = JobjeS.where('tests.*,seasons', obj, undefined, testErrorLog);
    if (JSON.stringify(subqueryBase2) !== JSON.stringify([obj["tests"], [obj["seasons"]]])) {
        log("subqueryBase2");
    }

    const subqueryBase3 = JobjeS.where('[tests.*],seasons', obj, undefined, testErrorLog);
    // these tests illustrate the structure the system returns when executing multi-query calls
    if (JSON.stringify(subqueryBase3) !== JSON.stringify([obj["tests"], [obj["seasons"]]])) {
        log("subqueryBase3");
    }

    let pausePoint = 1;
}

// Wildcard examples
{
    // all of these match, but do so in different ways

    // * matches anything
    const wildcardAny = JobjeS.where('tests.*', obj, undefined, testErrorLog);
    if (JSON.stringify(wildcardAny) !== JSON.stringify(obj["tests"])) {
        log("wildcardAny");
    }

    // @ only matches arrays
    const wildcardArray = JobjeS.where('tests.@', obj, undefined, testErrorLog);
    if (JSON.stringify(wildcardArray) !== JSON.stringify(obj["tests"])) {
        log("wildcardArray");
    }

    // ** matches anything to any depth 
    // (meaning, it will flatten out the entire structure and let you query against all of it at once)
    const wildcardAnyAtAll = JobjeS.where('tests.**.(label)', obj, undefined, testErrorLog);
    if (JSON.stringify(wildcardAnyAtAll) !== JSON.stringify(obj["tests"])) {
        log("wildcardAnyAtAll");
    }

    let pausePoint = 1;
}

// Filter vs Condition examples
{
    // result: Test and Test4, either the content of the label field (first example) or the container object (second example)
    const filterExample = JobjeS.where('tests.*.label#("Test"||"Test4")', obj, undefined, testErrorLog);
    if (JSON.stringify(filterExample) !== JSON.stringify(["Test", "Test4"])) {
        log("filterExample");
    }

    const conditionExample = JobjeS.where('tests.*.label:("Test"||"Test4")', obj, undefined, testErrorLog);
    if (JSON.stringify(conditionExample) !== JSON.stringify([obj["tests"][0], obj["tests"][3]])) {
        log("conditionExample");
    }

    let pausePoint = 1;
}

// Function examples
{
    // execute a function and return its result
    const standaloneFunctionCall = JobjeS.where('func;', obj, undefined, testErrorLog);
    if (JSON.stringify(standaloneFunctionCall) !== JSON.stringify([obj["func"]()])) {
        log("standaloneFunctionCall");
    }

    // this is an example of a function call with parameters.
    //      (see { "test": ['a week'] } in the constructor)
    let functionParameterLog = [];

    // result: { 'label': 'Test4', 'outcome': true, 'jump': *function* }
    const functionWithParameter = JobjeS.where('tests.3.jump;"test":/a week/', obj, { "test": ['a week'] }, testErrorLog);
    if (JSON.stringify(functionWithParameter) !== JSON.stringify([obj["tests"][3]])) {
        log("functionWithParameter");
    }

    // result: undefined (see the function it's calling and note that it is not providing a parameter)
    const functionInPathrun1 = JobjeS.where('tests.3.jump;.height', obj, undefined, testErrorLog);
    if (JSON.stringify(functionInPathrun1) !== '[]') {
        log("functionInPathrun1");
    }

    // result: '10 feet'
    const functionInPathrun2 = JobjeS.where('func;.action.jump', obj, undefined, testErrorLog);
    if (JSON.stringify(functionInPathrun2) !== '["10 feet"]') {
        log("functionInPathrun2");
    }

    let pausePoint = 1;
}

// Conversion examples
{
    // these two simple conversion examples demonstrate the 
    // difference between converting an array and converting the array's contents

    // the query preceding the conversion hands the conversion an array of items
    // that is why hard indexing the array is valid
    const arrayExample1 = JobjeS.where('awning listing.medium.{0.manufacturer+>first,1.manufacturer+>second}', obj, undefined, testErrorLog);
    if (JSON.stringify(arrayExample1) !== '[{"first":"Rawshank Builders","second":"Crafted Primary"}]') {
        log("arrayExample1");
    }

    // this time, the query matches the array, resulting in the conversion receiving the items in the array
    const arrayExample2 = JobjeS.where('awning listing.medium.@.{manufacturer+>builder}', obj, undefined, testErrorLog);
    if (JSON.stringify(arrayExample2) !== '[{"builder":"Rawshank Builders"},{"builder":"Crafted Primary"},{"builder":"Lawshank Incorporated"}]') {
        log("arrayExample2");
    }

    // BREAKING CHANGE EXAMPLE:
    // previously, the first conversion did not work (I've changed from using the '*' wildcard to the '@' one, but that doesn't matter)
    // It now works.  This illustrates the biggest change made: 
    //      the items in the structure are evaluated, rather than the relationships connecting them.
    //
    // This makes the system significantly more straight forward.  
    //      i.e. a token in the script runs against a specific thing.  
    // This was not the case before and resulted in some things evaluating differently than might be expected.
    //
    // Note:
    //      the second line no longer works because 'source', in the first line, and the '*' in the second one, 
    //      match against the object generated by the conversion, and there is nothing beyond that for the second line's 'source' key.
    const conversion1 = JobjeS.where('tests.@.{label+>source,outcome+>verified,projects.duration+>time.length}.source', obj, undefined, testErrorLog);
    if (JSON.stringify(conversion1) !== '["Test","Test2","Test3","Test4"]') {
        log("conversion1");
    }

    const conversion2 = JobjeS.where('tests.@.{label+>source,outcome+>verified,projects.duration+>time.length}.*.source', obj, undefined, testErrorLog);
    if (JSON.stringify(conversion2) !== '[]') {
        log("conversion2");
    }

    // this conversion uses a condition to filter the resulting records by limiting the input
    const conversion3 = JobjeS.where('**.(projects.personnel:"4").label', obj, undefined, testErrorLog);
    if (JSON.stringify(conversion3) !== '["Test"]') {
        log("conversion3");
    }

    const conversion4 = JobjeS.where('{**.(projects.personnel:\'4\').label+>source}', obj, undefined, testErrorLog);
    if (JSON.stringify(conversion4) !== '[{"source":"Test"}]') {
        log("conversion4");
    }

    // by adding a '-' at the start of a conversion operator, the operation becomes optional
    //      meaning, if it fails, the conversion still continues
    const conversion5 = JobjeS.where('tests.@.{label+>name,projects.personnel-+>headcount,projects.personnel-!>"N/A",headcount}', obj, undefined, testErrorLog);
    if (JSON.stringify(conversion5) !== '[{"name":"Test","headcount":"4"},{"name":"Test2","headcount":"7"},{"name":"Test3","headcount":"2"},{"name":"Test4","headcount":"N/A"}]') {
        log("conversion5");
    }

    // the next two queries demonstrate blocking
    // the first one sets "found" or "N/A" instead of numbers for headcount
    // the second does the same, but deletes headcount when it finishes
    const conversion6 = JobjeS.where('tests.@.{label+>name,projects.personnel-!>"N/A",headcount,projects.personnel-!!>"Found",headcount}', obj, undefined, testErrorLog);
    if (JSON.stringify(conversion6) !== '[{"name":"Test","headcount":"Found"},{"name":"Test2","headcount":"Found"},{"name":"Test3","headcount":"Found"},{"name":"Test4","headcount":"N/A"}]') {
        log("conversion6");
    }

    const conversion7 = JobjeS.where('tests.@.{label+>name,projects.personnel-!>"N/A",headcount,projects.personnel-!!>"Found",headcount,headcount->}', obj, undefined, testErrorLog);
    if (JSON.stringify(conversion7) !== '[{"name":"Test"},{"name":"Test2"},{"name":"Test3"},{"name":"Test4"}]') {
        log("conversion7");
    }

    let pausePoint = 1;
}

// external functions
{
    // functions related to external manipulation are static
    const details = JobjeS.getExternals();

    // count is built-in
    const externalCount = JobjeS.where('$count(awning listing.light)', obj, undefined, testErrorLog);
    if (JSON.stringify(externalCount) !== '[3]') {
        log("externalCount");
    }

    // add and use a custom external function
    // Note:
    //      external functions are stored statically,
    //      providing global access to all instances
    JobjeS.addExternal(
        "append",
        "Takes an item (addition) and adds it to the context, if the context is an array.  Otherwise, does nothing.  Always returns the result.",
        (context, monitoring, addition) => {
            if (Array.isArray(context)) {
                context.push(addition);
            }

            return context;
        }
    );

    // parameter slug to provided to the function
    const customFunctionParameters = {
        "forgottenClient":
        {
            'manufacturer': 'Ted Industries',
            'size': 'tiny',
            'weight': '100kg'
        }
    };

    let functionParameterLog = [];
    const appendation = JobjeS.where('awning listing.light.$append($"forgottenClient")', obj, customFunctionParameters, testErrorLog);    
    if (JSON.stringify(appendation) !== '[{"manufacturer":"Rawshank Builders","size":"medium","weight":"100kg"},{"manufacturer":"Lawshank Incorporated","size":"small","weight":"40kg"},{"manufacturer":"Complete Solutions Inc.","size":"small","weight":"62kg"},{"manufacturer":"Ted Industries","size":"tiny","weight":"100kg"}]') {
        log("appendation");
    }

    let i = 0;
}

if (testErrors.length > 0) {
    throw new Error(`Errors were encountered during testing: ${testErrors.join(", ")}`);
}
```


Below are instance class usage examples.  They, too, have validation lines built in.
```
let testErrorLog = [];
// this function will trigger *every time* an item is found by a query.  
// It will give the item and its direct parent.
const onEachFound = (found, parent) => {
    let f = found;
    let i = 0;
}
const jjI = new JobjeSInstance(true, onEachFound, undefined, testErrorLog);

let testErrors = [];
const consoleOutput = true;
const log = (testName, toConsole = consoleOutput) => {
    const message = `Test '${testName}' failed`;
    testErrors.push(message);
    if (toConsole) {
        console.log(message);
    }
}

// Some query examples
{
    // result: the contents of the array at the given location
    const simpleExample1 = jjI.where('awning listing.medium', obj);
    if (simpleExample1[0].every((item) => obj['awning listing']['medium'].includes(item)) === false) {
        log("simpleExample1");
    }

    // result: 2
    const simpleExample2 = jjI.where('tests.2.projects.personnel', obj);
    if (JSON.stringify(simpleExample2) !== '["2"]') {
        log("simpleExample2");
    }

    // result: nothing
    // reason: the 3rd object in the tests property array has a projects.duration value of 'eight days', not 'a week'.
    const simpleExample3 = jjI.where('tests.2.projects.duration:"a week".personnel', obj);
    if (JSON.stringify(simpleExample3) !== '[]') {
        log("simpleExample3");
    }

    // result: 2
    const simpleExample4 = jjI.where('tests.2.(projects.duration:"eight days").projects.personnel', obj);
    if (JSON.stringify(simpleExample4) !== '["2"]') {
        log("simpleExample4");
    }

    // result: 7
    const simpleExample5 = jjI.where('tests.*.(projects.duration:"a week").projects.personnel', obj);
    if (JSON.stringify(simpleExample5) !== '["7"]') {
        log("simpleExample5");
    }

    // result: the entire object
    const simpleExample6 = jjI.where('(tests.2.projects.personnel:!!)', obj);
    if (JSON.stringify(simpleExample6) !== JSON.stringify([obj])) {
        // this doesn't take the functions into account, since stringify doesn't handle them, 
        // but it is close enough to test the structure matching
        log("simpleExample6");
    }

    // result: no match (nothing)
    const simpleExample7 = jjI.where('tests.2.projects.personnel.!', obj);
    if (JSON.stringify(simpleExample7) !== '[]') {
        log("simpleExample7");
    }

    // result: {'duration': 'a week', 'personnel': '7', 'leader': 'Scott'}
    const simpleExample8 = jjI.where('tests.1.projects.personnel:"4"||"7"', obj);
    if (JSON.stringify(simpleExample8) !== '[{"duration":"a week","personnel":"7","leader":"Scott"}]') {
        log("simpleExample8");
    }

    // result: 7, 2
    const simpleExample9 = jjI.where('tests.*.(projects.duration:"a week")||(projects.duration:"eight days").projects.personnel', obj);
    if (JSON.stringify(simpleExample9) !== '["7","2"]') {
        log("simpleExample9");
    }

    // results: everything
    const simpleExample10 = jjI.where('((seasons.winter:!!)||(seasons.spring:!!))', obj);
    if (JSON.stringify(simpleExample10) !== JSON.stringify([obj])) {
        // this doesn't take the functions into account, since stringify doesn't handle them, 
        // but it is close enough to test the structure matching
        log("simpleExample10");
    }

    // result: everything
    const simpleExample11 = jjI.where('(seasons.winter:!!||spring:!!)', obj);
    if (JSON.stringify(simpleExample11) !== JSON.stringify([obj])) {
        // this doesn't take the functions into account, since stringify doesn't handle them, 
        // but it is close enough to test the structure matching
        log("simpleExample11");
    }

    // result: nothing
    // why, when the others return everything?
    //
    // Paths and Conditions are considered separately:
    // the second condition has the seasons path prior to spring condition, but the first path (i.e. seasons) preceding 
    // winter has already taken affect.  This means that the second path is looking for seasons.seasons, which doesn't exist.  
    // Because it cannot find that path, it fails to change the context, which supercedes the condition 
    //  (i.e. spring:!!) and causes the parenthetical to fail as a whole, returning false.
    const simpleExample12 = jjI.where('(seasons.winter:!!||seasons.spring:!!)', obj);
    if (JSON.stringify(simpleExample12) !== "[]") {
        // this doesn't take the functions into account, since stringify doesn't handle them, 
        // but it is close enough to test the structure matching
        log("simpleExample12");
    }

    let pausePoint = 1;
}

// Subquery (multi queries in a single call) examples
{
    // baseline (to show what you would get without the post operators)
    const subqueryBase1 = jjI.where('[tests.*],[seasons.autumn]', obj);
    // these tests illustrate the structure the system returns when executing multi-query calls
    if (JSON.stringify(subqueryBase1) !== JSON.stringify([obj["tests"], [obj["seasons"]["autumn"]]])) {
        log("subqueryBase1");
    }

    const subqueryBase2 = jjI.where('tests.*,seasons', obj);
    if (JSON.stringify(subqueryBase2) !== JSON.stringify([obj["tests"], [obj["seasons"]]])) {
        log("subqueryBase2");
    }

    const subqueryBase3 = jjI.where('[tests.*],seasons', obj);
    // these tests illustrate the structure the system returns when executing multi-query calls
    if (JSON.stringify(subqueryBase3) !== JSON.stringify([obj["tests"], [obj["seasons"]]])) {
        log("subqueryBase3");
    }

    let pausePoint = 1;
}

// Wildcard examples
{
    // all of these match, but do so in different ways

    // * matches anything
    const wildcardAny = jjI.where('tests.*', obj);
    if (JSON.stringify(wildcardAny) !== JSON.stringify(obj["tests"])) {
        log("wildcardAny");
    }

    // @ only matches arrays
    const wildcardArray = jjI.where('tests.@', obj);
    if (JSON.stringify(wildcardArray) !== JSON.stringify(obj["tests"])) {
        log("wildcardArray");
    }

    // ** matches anything to any depth 
    // (meaning, it will flatten out the entire structure and let you query against all of it at once)
    const wildcardAnyAtAll = jjI.where('tests.**.(label)', obj);
    if (JSON.stringify(wildcardAnyAtAll) !== JSON.stringify(obj["tests"])) {
        log("wildcardAnyAtAll");
    }

    let pausePoint = 1;
}

// Filter vs Condition examples
{
    // result: Test and Test4, either the content of the label field (first example) or the container object (second example)
    const filterExample = jjI.where('tests.*.label#("Test"||"Test4")', obj);
    if (JSON.stringify(filterExample) !== JSON.stringify(["Test", "Test4"])) {
        log("filterExample");
    }

    const conditionExample = jjI.where('tests.*.label:("Test"||"Test4")', obj);
    if (JSON.stringify(conditionExample) !== JSON.stringify([obj["tests"][0], obj["tests"][3]])) {
        log("conditionExample");
    }

    let pausePoint = 1;
}

// Function examples
{
    // execute a function and return its result
    const standaloneFunctionCall = jjI.where('func;', obj);
    if (JSON.stringify(standaloneFunctionCall) !== JSON.stringify([obj["func"]()])) {
        log("standaloneFunctionCall");
    }

    // this is an example of a function call with parameters.
    //      (see { "test": ['a week'] } in the constructor)
    let functionParameterLog = [];
    const fpExample = new JobjeSInstance(true, undefined, { "test": ['a week'] }, functionParameterLog);

    // result: { 'label': 'Test4', 'outcome': true, 'jump': *function* }
    const functionWithParameter = fpExample.where('tests.3.jump;"test":/a week/', obj);
    if (JSON.stringify(functionWithParameter) !== JSON.stringify([obj["tests"][3]])) {
        log("functionWithParameter");
    }

    // result: undefined (see the function it's calling and note that it is not providing a parameter)
    const functionInPathrun1 = jjI.where('tests.3.jump;.height', obj);
    if (JSON.stringify(functionInPathrun1) !== '[]') {
        log("functionInPathrun1");
    }

    // result: '10 feet'
    const functionInPathrun2 = jjI.where('func;.action.jump', obj);
    if (JSON.stringify(functionInPathrun2) !== '["10 feet"]') {
        log("functionInPathrun2");
    }

    let pausePoint = 1;
}

// Conversion examples
{
    // these two simple conversion examples demonstrate the 
    // difference between converting an array and converting the array's contents

    // the query preceding the conversion hands the conversion an array of items
    // that is why hard indexing the array is valid
    const arrayExample1 = jjI.where('awning listing.medium.{0.manufacturer+>first,1.manufacturer+>second}', obj);
    if (JSON.stringify(arrayExample1) !== '[{"first":"Rawshank Builders","second":"Crafted Primary"}]') {
        log("arrayExample1");
    }

    // this time, the query matches the array, resulting in the conversion receiving the items in the array
    const arrayExample2 = jjI.where('awning listing.medium.@.{manufacturer+>builder}', obj);
    if (JSON.stringify(arrayExample2) !== '[{"builder":"Rawshank Builders"},{"builder":"Crafted Primary"},{"builder":"Lawshank Incorporated"}]') {
        log("arrayExample2");
    }

    // BREAKING CHANGE EXAMPLE:
    // previously, the first conversion did not work (I've changed from using the '*' wildcard to the '@' one, but that doesn't matter)
    // It now works.  This illustrates the biggest change made: 
    //      the items in the structure are evaluated, rather than the relationships connecting them.
    //
    // This makes the system significantly more straight forward.  
    //      i.e. a token in the script runs against a specific thing.  
    // This was not the case before and resulted in some things evaluating differently than might be expected.
    //
    // Note:
    //      the second line no longer works because 'source', in the first line, and the '*' in the second one, 
    //      match against the object generated by the conversion, and there is nothing beyond that for the second line's 'source' key.
    const conversion1 = jjI.where('tests.@.{label+>source,outcome+>verified,projects.duration+>time.length}.source', obj);
    if (JSON.stringify(conversion1) !== '["Test","Test2","Test3","Test4"]') {
        log("conversion1");
    }

    const conversion2 = jjI.where('tests.@.{label+>source,outcome+>verified,projects.duration+>time.length}.*.source', obj);
    if (JSON.stringify(conversion2) !== '[]') {
        log("conversion2");
    }

    // this conversion uses a condition to filter the resulting records by limiting the input
    const conversion3 = jjI.where('**.(projects.personnel:"4").label', obj);
    if (JSON.stringify(conversion3) !== '["Test"]') {
        log("conversion3");
    }

    const conversion4 = jjI.where('{**.(projects.personnel:\'4\').label+>source}', obj);
    if (JSON.stringify(conversion4) !== '[{"source":"Test"}]') {
        log("conversion4");
    }

    // by adding a '-' at the start of a conversion operator, the operation becomes optional
    //      meaning, if it fails, the conversion still continues
    const conversion5 = jjI.where('tests.@.{label+>name,projects.personnel-+>headcount,projects.personnel-!>"N/A",headcount}', obj);
    if (JSON.stringify(conversion5) !== '[{"name":"Test","headcount":"4"},{"name":"Test2","headcount":"7"},{"name":"Test3","headcount":"2"},{"name":"Test4","headcount":"N/A"}]') {
        log("conversion5");
    }

    // the next two queries demonstrate blocking
    // the first one sets "found" or "N/A" instead of numbers for headcount
    // the second does the same, but deletes headcount when it finishes
    const conversion6 = jjI.where('tests.@.{label+>name,projects.personnel-!>"N/A",headcount,projects.personnel-!!>"Found",headcount}', obj);
    if (JSON.stringify(conversion6) !== '[{"name":"Test","headcount":"Found"},{"name":"Test2","headcount":"Found"},{"name":"Test3","headcount":"Found"},{"name":"Test4","headcount":"N/A"}]') {
        log("conversion6");
    }

    const conversion7 = jjI.where('tests.@.{label+>name,projects.personnel-!>"N/A",headcount,projects.personnel-!!>"Found",headcount,headcount->}', obj);
    if (JSON.stringify(conversion7) !== '[{"name":"Test"},{"name":"Test2"},{"name":"Test3"},{"name":"Test4"}]') {
        log("conversion7");
    }

    let pausePoint = 1;
}

// external functions
{
    // functions related to external manipulation are static
    const details = JobjeSInstance.getExternals();

    // count is built-in
    const externalCount = jjI.where('$count(awning listing.light)', obj);
    if (JSON.stringify(externalCount) !== '[3]') {
        log("externalCount");
    }

    // add and use a custom external function
    // Note:
    //      external functions are stored statically,
    //      providing global access to all instances
    JobjeSInstance.addExternal(
        "append",
        "Takes an item (addition) and adds it to the context, if the context is an array.  Otherwise, does nothing.  Always returns the result.",
        (context, monitoring, addition) => {
            if (Array.isArray(context)) {
                context.push(addition);
            }

            return context;
        }
    );

    // parameter slug to provided to the function
    const customFunctionParameters = {
        "forgottenClient":
        {
            'manufacturer': 'Ted Industries',
            'size': 'tiny',
            'weight': '100kg'
        }
    };

    let functionParameterLog = [];
    const customFunctionExample = new JobjeSInstance(true, undefined, customFunctionParameters, functionParameterLog);
    const appendation = customFunctionExample.where('awning listing.light.$append($"forgottenClient")', obj);    
    if (JSON.stringify(appendation) !== '[{"manufacturer":"Rawshank Builders","size":"medium","weight":"100kg"},{"manufacturer":"Lawshank Incorporated","size":"small","weight":"40kg"},{"manufacturer":"Complete Solutions Inc.","size":"small","weight":"62kg"},{"manufacturer":"Ted Industries","size":"tiny","weight":"100kg"}]') {
        log("appendation");
    }

    let i = 0;
}

if (testErrors.length > 0) {
    throw new Error(`Errors were encountered during testing: ${testErrors.join(", ")}`);
}
```
## Feedback
Feedback and bug reports are welcome.  
Please report them on the github.