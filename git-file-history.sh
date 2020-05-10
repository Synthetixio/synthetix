#!/bin/bash

# we'll write all git versions of the file to this folder:
EXPORT_TO=/tmp/all_versions_exported

# take relative path to the file to inspect
GIT_PATH_TO_FILE=$1

# ---------------- don't edit below this line --------------

USAGE="Please cd to the root of your git proj and specify path to file you with to inspect (example: $0 some/path/to/file)"

# check if got argument
if [ "${GIT_PATH_TO_FILE}" == "" ]; then
    echo "error: no arguments given. ${USAGE}" >&2
    exit 1
fi

# check if file exist
if [ ! -f ${GIT_PATH_TO_FILE} ]; then
    echo "error: File '${GIT_PATH_TO_FILE}' does not exist. ${USAGE}" >&2
    exit 1
fi

# extract just a filename from given relative path (will be used in result file names)
GIT_SHORT_FILENAME=$(basename $GIT_PATH_TO_FILE)

# create folder to store all revisions of the file
if [ ! -d ${EXPORT_TO} ]; then
    echo "creating folder: ${EXPORT_TO}"
    mkdir ${EXPORT_TO}
fi

## uncomment next line to clear export folder each time you run script
rm ${EXPORT_TO}/*

# reset coutner
COUNT=0

# iterate all revisions
git rev-list --all --objects -- ${GIT_PATH_TO_FILE} | \
    cut -d ' ' -f1 | \
while read h; do \
     COUNT=$((COUNT + 1)); \
     COUNT_PRETTY=$(printf "%04d" $COUNT); \
     COMMIT_DATE=`git show --pretty="%aI" $h | head -1`; \
     if [ "${#COMMIT_DATE}" -ge 25 ]; then \
         git cat-file -p ${h}:${GIT_PATH_TO_FILE} > ${EXPORT_TO}/${COMMIT_DATE}.${h}.${GIT_SHORT_FILENAME};\
     fi;\
done

# return success code
echo "result stored to ${EXPORT_TO}"
exit 0
