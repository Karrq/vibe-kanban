#!/bin/bash

# Find all Rust files that create NormalizedEntry without tool_result field
echo "Fixing NormalizedEntry creations..."

# For each file, add tool_result: None, after content field
for file in $(find backend/src -name "*.rs" -exec grep -l "NormalizedEntry {" {} \;); do
    echo "Processing $file"
    
    # Use perl to add tool_result field after content field
    perl -i -pe 's/(content: .+,)$/$1\n                        tool_result: None,/ if /^\s+content: / && !$seen{$.}++' "$file"
    
    # Alternative approach using sed for simpler cases
    sed -i.bak -E '
        /NormalizedEntry \{/,/\}/ {
            /content: .*,$/ {
                N
                s/(content: .*,)(\n.*metadata:)/\1\n            tool_result: None,\2/
                t
                s/(content: .*,)$/\1\n            tool_result: None,/
            }
        }
    ' "$file"
    
    # Clean up backup files
    rm -f "$file.bak"
done

echo "Done!"