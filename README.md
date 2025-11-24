# NSI-Extension

An extension designed to facilitate answering course questions on the `raisintine.fr` website for NSI (Numérique et Sciences Informatiques). It automatically analyzes questions on the page and provides answers by highlighting choices, filling in text fields, or indicating the correct order for matching exercises.

> [!IMPORTANT]
> This extension has only been tested on Firefox and may be prone to numerous bugs on other browsers.

## Features

*   **Automatic Answering:** Reads questions from the page and provides answers based on a comprehensive `index.json` file.
*   **Multiple Question Types Supported:**
    *   **Multiple Choice:** Automatically selects and highlights the correct radio buttons or checkboxes.
    *   **Fill-in-the-Blank:** Fills text input fields with the correct answers for coding and text-based questions.
    *   **Drag-and-Drop Matching:** Indicates the correct matching order for association exercises by prepending numbers to the items.
    *   **Image-Based Questions:** Identifies questions by the associated image URL and provides the corresponding answers.
*   **Smart Answer Logic:** Intelligently derives answers for dynamic questions that are not pre-indexed, including:
    *   Python string slicing, f-strings, and `.replace()` operations.
    *   List and dictionary manipulation.
    *   Complex list comprehension completions.
    *   Data type identification (e.g., `list of lists` vs. `list of dictionaries` from `csv.reader`).
    *   Sorting method completions (`.sort()`).
*   **Developer Tools:** Includes a logging system to capture new or unanswered questions. Use the browser's developer console to manage and export these logs.

## How to Use (Installation on Firefox)

1.  Download the repository files to your local machine by clicking `Code -> Download ZIP`.
2.  Extract the ZIP file.
3.  Open Firefox and navigate to the `about:debugging` page.
4.  Click on "This Firefox" in the left-hand sidebar.
5.  Click the "Load Temporary Add-on..." button.
6.  Navigate to the extracted directory and select the `manifest.json` file.
7.  The extension is now active. Navigate to `https://raisintine.fr/chocolatine/question.php` to see it in action.

## Developer Tools & Contributing

The extension includes console commands to help log new questions and improve the answer index.

1.  On a `raisintine.fr` question page, open the Developer Console (`F12` or `Ctrl+Shift+I`).
2.  Use the following commands:
    *   `showNSILogs()`: Displays a table of the last 100 questions encountered.
    *   `exportNSILogs()`: Downloads a `.log` file containing the questions you've visited. This is useful for identifying unanswered questions and adding them to `index.json`.
    *   `clearNSILogs()`: Clears the locally stored logs.

To contribute, you can use the logger to find new questions, add them and their answers to your local `index.json`, and submit a pull request.

## License

This extension is open-source and does not require any license. It is completely free of rights and can be modified in any way.
