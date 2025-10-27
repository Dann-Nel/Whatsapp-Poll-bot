# WhatsApp Poll Bot - Code Documentation

This document provides a technical overview of the WhatsApp Poll Bot script for developers who may need to maintain or extend its functionality.

## 1. Project Overview

The project is a Python script that uses the Selenium library to automate sending polls to a specified WhatsApp group on a schedule. It is designed to be configurable via a JSON file and includes logging for monitoring and debugging.

## 2. File Structure

-   **`poll_sender.py`**: The core Python script containing all the automation logic.
-   **`config.json`**: A configuration file to define the target group, poll content, and schedule without modifying the code.
-   **`run_poll_bot.bat`**: A Windows batch script that sets up the Python virtual environment and executes `poll_sender.py`.
-   **`requirements.txt`**: Lists the necessary Python libraries (`selenium`, `schedule`) for easy installation.
-   **`poll_bot.log`**: The log file where the script records its actions, successes, and errors.
-   **`SETUP_GUIDE.md`**: Instructions for end-users to set up and run the bot.
-   **`CODE_DOCUMENTATION.md`**: This file.

## 3. Core Script Analysis: `poll_sender.py`

### 3.1. Imports and Setup

-   **Libraries**:
    -   `selenium`: The primary library for browser automation.
    -   `schedule`: Used to run the main function at a scheduled time.
    -   `json`: For parsing the `config.json` file.
    -   `logging`: For writing status and error messages to `poll_bot.log`.
    -   `os`: Used to construct a reliable file path for the Chrome user profile in the user's local AppData directory.
-   **Logging**: Configured to write all messages of level `INFO` and above to `poll_bot.log`, with a timestamp.
-   **Configuration**: The script loads all necessary parameters (group name, poll details, schedule) from `config.json` at startup. This separation of configuration from code is a key design principle.

### 3.2. `send_whatsapp_poll()` Function

This is the main function where all the browser automation occurs.

#### Browser Initialization

-   **`Service`**: Manages the `chromedriver.exe` process.
-   **`ChromeOptions`**:
    -   `options.add_experimental_option("detach", True)`: This is a crucial debugging feature. It keeps the Chrome window open after the script finishes, allowing a developer to inspect the final state of the page, especially after an error.
    -   `options.add_argument(f"user-data-dir={profile_path}")`: This is the most important option for session persistence. It tells Chrome to use a specific profile directory.
        -   The path is constructed using `os.getenv('LOCALAPPDATA')` to place the profile in a standard, user-writable location (`%LOCALAPPDATA%\WhatsAppPollBot\user_data`). This avoids file permission errors that can occur when writing to the script's own directory.
        -   By reusing this profile, the bot does not need to scan the QR code on every run.

#### Automation Workflow

The script uses `WebDriverWait` extensively to ensure it only proceeds when the web page is ready. This makes it resilient to variations in network speed and page load times.

1.  **Login**: The script navigates to `web.whatsapp.com` and waits up to 120 seconds for the main chat search bar to appear. This long timeout gives the user ample time to scan the QR code on the first run.
2.  **Group Navigation**:
    -   It types the `GROUP_NAME` into the chat search bar.
    -   It waits for the corresponding group to appear in the results and clicks it. The XPath `//span[@title="{GROUP_NAME}"]` is used for reliable selection.
3.  **Poll Creation**:
    -   The script follows the UI flow: it clicks the "Attach" button (`aria-label="Attach"`), then waits for and clicks the "Poll" button.
4.  **Filling the Poll**:
    -   It waits for the poll creation dialog to appear.
    -   It finds all `div` elements with `contenteditable="true"` within the dialog. The first is the question, and the subsequent ones are the options.
    -   It dynamically loops through the `POLL_OPTIONS` from the config file, filling each option field. A `wait.until` is used inside the loop to handle the dynamic addition of new option fields by WhatsApp's UI.
    -   A brief `time.sleep(1)` is used to ensure the UI has time to process the inputs and enable the final send button.
5.  **Final Steps**:
    -   **Toggle**: It finds the "Allow multiple answers" toggle by its unique ID (`polls-single-option-switch`). It intelligently checks the `aria-checked` attribute and only clicks the toggle if it's currently `"true"`.
    -   **Send**: It clicks the final "Send" button, which is specifically located within the poll dialog using the selector `//div[@role="dialog"]//div[@aria-label="Send"]`.

#### Error Handling

-   The entire workflow is wrapped in a `try...except...finally` block.
-   `TimeoutException`: Catches errors where `WebDriverWait` fails to find an element within the time limit. This is the most common error and usually indicates a change in WhatsApp's UI.
-   `NoSuchElementException`: Catches errors where an element is looked for without a wait and is not found.
-   `Exception as e`: A general catch-all for any other unexpected errors.
-   `finally`: This block ensures that a final log message is always written, regardless of whether the script succeeded or failed.

### 3.3. Main Execution Block (`if __name__ == "__main__":`)

-   This block handles the scheduling logic.
-   It uses `getattr(schedule_job, SCHEDULE_DAY)` to dynamically call the correct day method on the schedule object (e.g., `schedule.every().saturday`). This makes the configuration very flexible.
-   It schedules the `send_whatsapp_poll` function to run at the specified `SCHEDULE_TIME`.
-   The `while True:` loop is the scheduler's heartbeat. It runs continuously, checking every second if a scheduled job is due to run.
-   `KeyboardInterrupt` is handled gracefully so the user can stop the scheduler with `Ctrl+C`.