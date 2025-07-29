#\!/bin/bash

test_function() {
    echo "Function executed successfully"
    return 0
}

# Test 1: Direct call
echo "Test 1: Direct call"
if test_function; then
    echo "Exit code: 0"
else
    echo "Exit code: $?"
fi

# Test 2: Background with output redirection
echo -e "\nTest 2: Background with output redirection"
{
    echo "1" > test.exitcode
    if test_function > test.log 2>&1; then
        echo "0" > test.exitcode
    else
        echo "1" > test.exitcode
    fi
} &
wait
echo "Exit code from file: $(cat test.exitcode)"
echo "Log contents: $(cat test.log)"

# Cleanup
rm -f test.exitcode test.log
