export const arrayObjectKeyValidate = (value, objKeys) => {
  if (value.length > 0) {
    // console.log(objKeys);
    for (const inputData of value) {
      for (const objKeysDetails of objKeys) {
        //checking for string from form data
        if (inputData && typeof inputData == "string") {
          const parsedData = JSON.parse(inputData);
          if (objKeysDetails.keyName in parsedData) {
            // check the key is required or optional
            if (objKeysDetails.option == "required") {
              if (
                parsedData[objKeysDetails.keyName] == null ||
                parsedData[objKeysDetails.keyName] == ""
              ) {
                return `${objKeysDetails.keyName} is required`;
              } else {
                // check for the data type mismatch
                if (typeof parsedData[objKeysDetails.keyName] != objKeysDetails.dataType) {
                  return `${objKeysDetails.keyName} should be ${objKeysDetails.dataType}`;
                }
              }
            } else if (objKeysDetails.option == "optional") {
              // check for the data type mismatch
              if (
                parsedData[objKeysDetails.keyName] &&
                typeof parsedData[objKeysDetails.keyName] != objKeysDetails.dataType
              ) {
                return `${objKeysDetails.keyName} should be ${objKeysDetails.dataType}`;
              }
            }
          } else {
            // if the defined keys are not present in the input
            return "Valid keys are not present";
          }
        }
      }
    }
    return true;
  } else {
    return true;
  }
};
