
# Tree sitter parser for Newt

Work in progress.

Not completely accurate, intended for editor use.  We're ignoring the existance of mixfix and parsing as an app list.

The layout is doing the Haskel fake token thing for now. I'm not sure it's doing what I want though. Newt will kill tokens if they're out of indent. tree-sitter will not ask for START if it's not expected? .. Maybe we return one anyway.
