# need to cd into contracts to allow sol imports within the files to work
cd contracts
solcjs -o complied/ --bin --abi *.sol
cd ..