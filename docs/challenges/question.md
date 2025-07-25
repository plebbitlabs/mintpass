# Question challenge

API: https://github.com/plebbit/plebbit-js/tree/master/src/runtime/node/subplebbit/challenges/plebbit-js-challenges

Code:

```ts
import type { Challenge, ChallengeFile, ChallengeResult, SubplebbitChallengeSetting } from "../../../../../subplebbit/types.js";
import type { DecryptedChallengeRequestMessageTypeWithSubplebbitAuthor } from "../../../../../pubsub-messages/types.js";

const optionInputs = <NonNullable<ChallengeFile["optionInputs"]>>[
    {
        option: "question",
        label: "Question",
        default: "",
        description: "The question to answer.",
        placeholder: ""
    },
    {
        option: "answer",
        label: "Answer",
        default: "",
        description: "The answer to the question.",
        placeholder: "",
        required: true
    }
];

const type: Challenge["type"] = "text/plain";

const description = `Ask a question, like 'What is the password?'`;

const getChallenge = async (
    subplebbitChallengeSettings: SubplebbitChallengeSetting,
    challengeRequestMessage: DecryptedChallengeRequestMessageTypeWithSubplebbitAuthor,
    challengeIndex: number
): Promise<Challenge | ChallengeResult> => {
    if (!subplebbitChallengeSettings?.options?.question) throw Error("No option question");
    let answer = subplebbitChallengeSettings?.options?.answer;
    if (!answer) {
        throw Error("no option answer");
    }

    // use the answer preincluded in the challenge request when possible
    const challengeAnswer = challengeRequestMessage?.challengeAnswers?.[challengeIndex];

    // the author didn't preinclude his answer, so send him a pubsub challenge message
    if (challengeAnswer === undefined) {
        return {
            challenge: subplebbitChallengeSettings?.options?.question,
            verify: async (_answer: string) => {
                if (_answer === answer)
                    return {
                        success: true
                    };
                return {
                    success: false,
                    error: "Wrong answer."
                };
            },
            type
        };
    }

    // the author did preinclude his answer, but it's wrong, so send him a failed challenge verification
    if (challengeAnswer !== answer) {
        return {
            success: false,
            error: "Wrong answer."
        };
    }

    // the author did preinclude his answer, and it's correct, so send him a success challenge verification
    return {
        success: true
    };
};

function ChallengeFileFactory(subplebbitChallengeSettings: SubplebbitChallengeSetting): ChallengeFile {
    // some challenges can prepublish the challenge so that it can be preanswered
    // in the challengeRequestMessage
    const question = subplebbitChallengeSettings?.options?.question;
    const challenge = question;

    return { getChallenge, optionInputs, type, challenge, description };
}

export default ChallengeFileFactory;
```